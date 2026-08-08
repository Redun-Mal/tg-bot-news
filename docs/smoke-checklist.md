# End-to-end smoke checklist

Full pipeline: add source → poll → normalize → dedupe → classify → alert/digest → commands → NL query. Started as a design-time checklist (Stage A–L, no live n8n or Telegram bot available); a real `TELEGRAM_BOT_TOKEN` later made it possible to stand up n8n headlessly via its REST API and build/verify 12 of 12 workflows live — see `docs/decisions/005-n8n-postgres-node-quirks.md` for the seven real n8n bugs found in the process. Split below into what's actually been run against real services and what still needs a `CLAUDE_API_KEY` to finish.

## Verified live against a real n8n instance + real external services

All 12 workflows in `docs/workflows/`/`n8n/workflows/` were built via n8n's REST API (headless owner-account bootstrap, no browser) and executed for real — not just spec-reviewed. Each workflow's own "n8n JSON" section has the specifics; summary:

- [x] `health_check` — full run against real Postgres/RSSHub/helper-api; edge-triggered alerting logic confirmed on a first-ever run (no prior row).
- [x] `add_source` — a real public channel (`t.me/telegram`) added via a real RSSHub fetch; duplicate rejection; a nonexistent channel correctly landing in `error` status against a real RSSHub 503.
- [x] `remove_source` / `pause_source` / `resume_source` — full state-machine walk (`active` → `paused` → reject re-pause → `active`, `error_count` reset), idempotent re-removal.
- [x] `poll_rss_sources` — **active and running on its real 10-minute schedule**, not just manually triggered; 71 real posts ingested across the user's 4 real added channels; re-run confirmed as a true no-op; failure branch confirmed against a genuinely unreachable feed.
- [x] `deduplicate_posts` — **active and running on its real schedule**; a real near-duplicate post correctly merged into an existing `news_item` via `pg_trgm`; an unrelated post correctly left unresolved.
- [x] `manage_interests` — add/case-insensitive-duplicate/remove/re-remove/over-length-rejection, all confirmed live.
- [x] `send_instant_alerts` / `daily_digest` — reservation, real `/format-digest` calls, and the failure-releases-the-reservation path all confirmed. **Success/confirm path now also verified**: one manually-seeded demo `news_item` (built from a real ingested post, standing in for what `classify_with_claude` would produce) was sent via `send_instant_alerts` and genuinely delivered to the real user's Telegram, `Confirm delivery` correctly marked it delivered. Not scheduled/active for continuous operation yet — no real classified items exist to send without a Claude key, so leaving them running would be inert.
- [x] `error_handler` — a real `workflow_logs` row written from a mock error payload; wired as the **Error Workflow** on all 12 workflows.
- [x] `classify_with_claude` — filter-out path confirmed (a giveaway post never reaches Claude); the Claude call itself got a genuine `401 authentication_error` from Anthropic's real API (no real key was available) and correctly logged/left the post unresolved. **The successful-classification path is unverified.**
- [x] `telegram_commands` — **the one workflow proven with a real Telegram user, over a real webhook** (n8n exposed via an ngrok tunnel): auth gate (real allowed user passes; a synthetic non-allowed sender is silently ignored), `/help`, `/sources`, `/add_source <url>` (dispatching through a real `Execute Workflow` call, really adding a channel), and free text correctly falling through to "unknown command" — all confirmed against 8 real incoming messages.

## Still needs a real `CLAUDE_API_KEY` to finish

- [ ] `classify_with_claude`'s successful-classification path: parsing a real Claude response into a `news_items` row, and the level-4 (post-AI) dedup check against it.
- [x] ~~`send_instant_alerts` / `daily_digest`'s success/confirm path~~ — verified live with a manually-seeded demo item (see above). Fully proven end to end; only actual classified `news_item`s to send are missing.
- [ ] `telegram_commands`' NL free-text intent routing (`/news`, `/digest`, and the natural-language query examples) needs a Claude call it doesn't yet have wired up — see that workflow's spec for what's built vs. not.

## Also not yet built (spec exists, same proven patterns apply)

`/news`, `/news <category>`, `/digest`, `/remove_source`, `/pause_source`, `/resume_source`, `/set_interest`, `/remove_interest`, `/settings`, `/set_time` inside `telegram_commands` — the dispatcher currently only wires up `/start`, `/help`, `/sources`, `/add_source`. Each remaining command is an `Execute Workflow` call into an already-verified sub-workflow (`remove_source`, `pause_source`, `resume_source`, `manage_interests`) plus a Postgres query, following the exact pattern `/add_source` already proves works end-to-end.

## Known gaps (documented, not silently papered over)

- `/set_time` vs. `daily_digest`'s cron: the setting would be stored but the cron trigger doesn't read it back (`docs/decisions/`, `docs/workflows/telegram_commands.md`).
- `daily_digest`'s multi-message partial-failure case (some chunks send, one doesn't) isn't guaranteed all-or-nothing by the current wiring — untested since the live test digest only produced one message (`docs/workflows/daily_digest.md`).
- ~~One transient `RangeError`...~~ **Not actually transient** — it was Telegram Trigger v1.1's secret-token check crashing the entire n8n process on every real message (Quirk 8). Fixed by pinning `typeVersion 1`. Confirmed fixed by posting a synthetic Telegram-shaped update directly to the webhook after the change: `200`, execution succeeded, no new crash in the container logs where the same request shape had crashed it before.
