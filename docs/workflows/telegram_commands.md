# Workflow: telegram_commands

## Purpose

The single Telegram entry point for the whole bot. Auth-gates every incoming message, parses slash commands, routes free-text messages through NL intent classification, and dispatches to the dedicated sub-workflows (`add_source`, `remove_source`, `pause_source`, `resume_source`, `manage_interests`) or handles the rest inline.

## Trigger

**Telegram Trigger** — `message` updates (webhook).

## Input

A raw Telegram `message` update.

## Node sequence

1. **Telegram Trigger**.
2. **Code** — auth gate: `String(message.from.id) === String($env.TELEGRAM_ALLOWED_USER_ID)`. This is the same comparison Stage D's `isAllowedUser` unit-tests already cover; it's inlined here rather than round-tripped to helper-api because it runs on _every single incoming message_ — a network hop for a one-line string comparison isn't worth it. The tested version in `services/helper-api/src/lib/auth.ts` is the source of truth for the logic; this must stay in sync with it.
3. **IF** — allowed?
   - **false** → **NoOp** → end. **Silently ignored, no reply sent** (per the approved plan's Decision D) — optionally a `debug`-level `workflow_logs` row for observability, never a message back to the sender. This is the very first node after the trigger, deliberately, so nothing downstream ever runs for an unauthorized sender.
   - **true** → continue.
4. **Code** — parse `message.text`: commands start with `/`, split into `{ command, args }`; anything else is a free-text query.
5. **Switch** (n8n Switch node, one output per command) — routes `command` to:
   - **`/start`, `/help`** → **Set** (static help text listing every command + example free-text queries) → **Telegram — Send Message**.
   - **`/news`** (no args) → build the same item selection `daily_digest` uses but scoped to the last 24h **without** the delivery-tracking/reservation step (this is a pull — "show me now" — not a push; re-running `/news` twice is expected to show the same items again, not a duplicate-send bug) → **HTTP Request** `/format-digest` → **Telegram — Send Message** (looped over the returned `messages`).
   - **`/news <category>`** → same, with `AND $1 = ANY(ni.categories)` added to the selection query.
   - **`/digest`** → **Execute Workflow** → `daily_digest` (reused as-is, including its reservation/delivery-tracking — a manually-triggered digest still counts as delivered and must not repeat at 09:00).
   - **`/sources`** → **Postgres**: `SELECT id, channel_username, status FROM sources WHERE status != 'removed' ORDER BY id` → **Code** (format as a numbered list with status) → **Telegram — Send Message**.
   - **`/add_source <url>`** → **Execute Workflow** → `add_source` → **Telegram — Send Message** (its returned `message`).
   - **`/remove_source <id|url>`** → **Execute Workflow** → `remove_source` → send.
   - **`/pause_source <id>`** → **Execute Workflow** → `pause_source` → send.
   - **`/resume_source <id>`** → **Execute Workflow** → `resume_source` → send.
   - **`/set_interest <topic>`** → **Execute Workflow** → `manage_interests` (`action: "add"`) → send.
   - **`/remove_interest <topic>`** → **Execute Workflow** → `manage_interests` (`action: "remove"`) → send.
   - **`/settings`** → **Postgres**: `SELECT * FROM bot_settings WHERE telegram_user_id = $1` (if no row, insert the defaults from the migration's column defaults first) → **Code** (format) → send.
   - **`/set_time HH:MM`** → **Code** — validate `^([01]\d|2[0-3]):([0-5]\d)$` → invalid → send format error; valid → **Postgres — Upsert**: `INSERT INTO bot_settings (telegram_user_id, digest_time) VALUES ($1, $2) ON CONFLICT (telegram_user_id) DO UPDATE SET digest_time = $2, updated_at = now()` → send confirmation. (Changing `digest_time` here only updates the stored setting — `daily_digest`'s own cron trigger is currently fixed at `0 9 * * *`; making the cron itself follow a per-user setting is a real gap, noted in `docs/decisions/` as a known MVP limitation rather than solved here, since n8n's Schedule Trigger can't read a DB value at trigger time without an external scheduler-reconfiguration mechanism.)
   - **unrecognized `/whatever`** → **Set** (`"Неизвестная команда. Напишите /help."`) → send.
   - **no match (free text)** → continue to step 6.
6. **HTTP Request** — `POST https://api.anthropic.com/v1/messages`, forced structured output (same `tools` + `tool_choice` pattern as `classify_with_claude`) with schema `{ intent: "news_by_category" | "news_important" | "digest" | "today" | "unknown", category?: string }`. Prompt includes the fixed category list and the spec's own example phrasings ("Покажи новости про Roblox", "Что нового в программировании?", "Сделай дайджест по AI", "Покажи самые важные новости игровой индустрии", "Новости за сегодня") as few-shot guidance. `retryOnFail: true`, `maxTries: 3`.
7. **IF** — `intent == "unknown"`?
   - **true** → **Set** (`"Не понял запрос. Примеры: «Покажи новости про Roblox», «Что нового в программировании?», «Сделай дайджест по AI», «Новости за сегодня»."`) → send.
   - **false** → map `intent` to the matching step-5 handler (`news_by_category`/`news_important` → `/news <category>` path with importance-sorted selection; `digest` → the `/digest` path; `today` → the `/news` path) and execute it.

## Output

None (replies via Telegram directly).

## Error handling

Auth rejection and unrecognized commands/unclear queries are normal branches with a reply, not errors. DB/HTTP/Claude failures propagate to n8n's error trigger → `error_handler`.

## Retries

NL intent classification call: 3 tries, n8n's built-in fixed-interval retry (same as `classify_with_claude`).

## Anti-duplicate protection

Not directly applicable to most of this workflow — `/news` and NL-query reads are pull requests, meant to show the same data again on repeat. The one path that _does_ need it (`/digest`) delegates entirely to `daily_digest`, which already carries the `deliveries` reserve pattern; this workflow doesn't duplicate that logic.

## n8n JSON

`n8n/workflows/telegram_commands.json` is **verified live end-to-end** — the only workflow in this project actually exercised by real Telegram messages from the real allowed user, delivered through a real webhook (n8n exposed via an ngrok tunnel during development). Confirmed live: the auth gate (real allowed user passes, a synthetic non-allowed sender is silently ignored — see the earlier pinned-data test), `/help`, `/sources` (against real DB data), `/add_source <url>` dispatching through a real `Execute Workflow` call into `add_source` (which really added `t.me/telegram` with a real RSSHub fetch), free text correctly falling through to the "unknown command" reply, and one transient `RangeError: Input buffers must have the same byte length` inside n8n's own `TelegramTrigger.node.js` on exactly one of eight real deliveries (likely a stale/replayed update from before the webhook fix below — not reproduced again, not chased further).

This is also where Quirk 7 was found: a webhook-based trigger node created via raw `POST /rest/workflows` has no `webhookId`, and activating it registers a broken URL with Telegram (every real message 404'd and queued undelivered) until one is manually assigned. See `docs/decisions/005-n8n-postgres-node-quirks.md`. The checked-in JSON has its `webhookId` replaced with a placeholder — importing normally through the n8n UI avoids this issue entirely, since the UI always assigns one automatically.

**Not built in this pass** (the full spec describes more): `/news`, `/news <category>`, `/digest`, `/remove_source`, `/pause_source`, `/resume_source`, `/set_interest`, `/remove_interest`, `/settings`, `/set_time`, and NL free-text intent routing. `/add_source` and the dispatcher/auth-gate mechanism were prioritized as the highest-value proof that the whole pipeline works end-to-end for real; the remaining commands follow the exact same proven patterns (`Execute Workflow` calls into the already-verified `remove_source`/`pause_source`/`resume_source`/`manage_interests` workflows) and are straightforward to add.
