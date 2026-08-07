# Workflow: add_source

## Purpose

Handle `/add_source <public_url>`: validate the link, extract the channel username, build/save its RSS URL (via self-hosted RSSHub), verify the source is actually reachable, persist it, and never create a duplicate `sources` row for the same channel.

## Trigger

**Execute Workflow Trigger** (sub-workflow, called by `telegram_commands` after it has already auth-gated the sender and parsed the command).

## Input

```json
{ "telegramUserId": 123456789, "url": "https://t.me/example_channel" }
```

## Node sequence

1. **Execute Workflow Trigger** — receives `{ telegramUserId, url }`.
2. **Code** — validate and extract:
   - Regex: `^https:\/\/t\.me\/(?!s\/|joinchat\/|\+)([a-zA-Z0-9_]{5,32})\/?$`
   - Explicitly rejects `t.me/s/...` (the RSS-preview form, not a channel link the user should paste), `t.me/joinchat/...` and `t.me/+...` (private invite links — out of scope, public channels only).
   - On match, output `{ valid: true, channelUsername }`; otherwise `{ valid: false, error: "Ссылка не похожа на публичный Telegram-канал. Пример: https://t.me/example_channel" }`.
3. **IF** — `valid == true`?
   - **false** → **Set** (`message` = the error from step 2) → jump to step 9 (skip everything below).
   - **true** → continue.
4. **Postgres — Execute Query**: `SELECT id, status FROM sources WHERE channel_username = $1` (param: `channelUsername`).
5. **IF** — row found?
   - **true** → **Set** (`message` = `"Источник уже добавлен (статус: {{status}})."`) → jump to step 9.
   - **false** → continue.
6. **Code** — build `rssUrl = "{{RSS_BASE_URL}}/telegram/channel/{{channelUsername}}"` (`RSS_BASE_URL` from n8n environment/credentials, never hard-coded).
7. **HTTP Request** — `GET {{rssUrl}}`, timeout 10s, `retryOnFail: true`, `maxTries: 3`. Treat non-2xx or non-XML response as failure (does not throw — `onError: continueRegularOutput`, checked explicitly next).
8. **IF** — response status is 2xx and body parses as RSS/XML?
   - **true** → **Postgres — Insert**: `INSERT INTO sources (url, channel_username, rss_url, title, status, last_checked_at, last_success_at) VALUES ($1,$2,$3,$4,'active',now(),now()) ON CONFLICT (channel_username) DO NOTHING RETURNING id` (title taken from the feed's `<channel><title>` if present, else null). **Set** (`message` = `"Канал добавлен: {{channelUsername}}"`).
   - **false** → **Postgres — Insert**: same but `status = 'error'`, `last_checked_at = now()`, `last_success_at = NULL`. **Set** (`message` = `"Канал добавлен, но RSS сейчас недоступен (статус: error). Проверю автоматически позже."`).
9. **NoOp** (join point) → return `{ message }` to the caller.

## Output

```json
{ "message": "Канал добавлен: example_channel" }
```

`telegram_commands` is responsible for actually sending `message` back to the user.

## Error handling

- Validation and duplicate-check failures are handled as normal branches (steps 3/5), not thrown errors — the user gets a clear reply either way.
- Unexpected node failures (DB unreachable, etc.) propagate to n8n's workflow-level error trigger, picked up by `error_handler` (Stage J), which logs to `workflow_logs` and can optionally notify the user that something went wrong.

## Retries

HTTP reachability check: 3 tries, n8n's built-in fixed-interval retry (see `docs/decisions/` — n8n has no native exponential backoff; true exponential backoff would need a manual Wait-node loop, deferred as a later enhancement, not needed for a once-per-add-source check).

## Anti-duplicate protection

Two layers: an explicit `SELECT` check before insert (step 4, gives a clean user-facing message), and the `sources.channel_username` `UNIQUE` constraint as the final backstop (`ON CONFLICT DO NOTHING` on step 8, in case of a race between two concurrent `/add_source` calls for the same channel).
