# End-to-end smoke checklist

Full pipeline: add source → poll → normalize → dedupe → classify → alert/digest → commands → NL query. Split into what's been mechanically verified during development (no real Telegram bot or Claude key were available) and what needs the user's own credentials to complete.

## Verified (repeatable without external credentials)

- [x] `docker compose config` valid; all 4 services (`postgres`, `rsshub`, `n8n`, `helper-api`) reach `healthy` together.
- [x] `npm run lint` / `format:check` / `typecheck` / `test` — all green from repo root (59 tests, `services/helper-api`).
- [x] DB migrations: up → down → up round-trip, re-run idempotency, constraints inspected via `psql` (Stage B).
- [x] Seed script: 16 default interests, idempotent re-run (Stage B).
- [x] `helper-api` reachable from another container by service name, **not** reachable from the host (internal-only, Stage C).
- [x] RSSHub's real Telegram route fetches a live public channel (`/telegram/channel/telegram` → valid RSS XML) (Stage A/E).
- [x] Ingestion path simulated end-to-end without n8n: RSSHub fetch → `helper-api /normalize` → Postgres insert; re-running the same fetch inserts zero duplicate rows (`ON CONFLICT DO NOTHING`) (Stage E).
- [x] `sources` state machine: `active` → `paused` → `active` → `removed`; posts survive the soft-delete (Stage E).
- [x] `pg_trgm` dedup: two near-identical posts from different channels correctly fan into one `news_item` via `news_sources`; re-linking the same post is a no-op (Stage F).
- [x] `POST /validate-classification`: accepts well-formed and markdown-fenced responses, rejects every contract violation named in the spec, tolerant of unexpected extra fields (13 fixture tests, Stage G).
- [x] `POST /format-digest`: caps (5/category, 25 total), importance-then-relevance ordering, empty-section skipping, multi-category grouping, forced multi-message splitting under Telegram's 4096-char limit (21 tests, Stage H).
- [x] `deliveries` reserve-before-send pattern: a simulated overlapping second reservation attempt correctly returns 0 rows (Stage H).
- [x] `POST /validate-interest`: trims/collapses whitespace, enforces the 60-char cap (8 tests, Stage I).
- [x] `health_check`'s core detection mechanism: stopping the `rsshub` container makes a reachability check from another container fail exactly the way the workflow is designed to catch (connection error, not 200); restarting it confirms recovery detection too (Stage J).

## Needs the user's own credentials — not run in this environment

- [ ] **Live Claude API call** — `CLAUDE_API_KEY` was never available here. `classify_with_claude`'s prompt construction and the forced-structured-output request itself are unverified against real model output; only the response _validation_ side (`/validate-classification`) has been tested, against hand-written fixtures.
- [ ] **Live Telegram bot** — `TELEGRAM_BOT_TOKEN` was never available here. No command has actually been sent to a real bot; `telegram_commands`' full command-by-command checklist (allowed vs. non-allowed test account, per the plan) is unrun.
- [ ] **n8n workflow import** — every workflow in `docs/workflows/` needs to be built by hand in the n8n UI (or, for `health_check`, imported from the draft JSON and fixed up) and test-executed. None of them have been imported/run against a live n8n instance.
- [ ] **`/set_time` vs. `daily_digest`'s cron** — documented as a known gap (`docs/decisions/`, `docs/workflows/telegram_commands.md`): the setting is stored but the cron trigger doesn't currently read it back. Worth deciding how to close this before relying on a non-default digest time.
- [ ] **Real end-to-end run**: add a real channel via `/add_source`, wait for a poll cycle, confirm a post gets classified and either alerted instantly or shows up in the next digest.

## Suggested order once credentials are available

1. `n8n/credential-setup.md` — wire up Telegram, Claude, Postgres credentials.
2. Build `health_check` first (has a JSON draft to start from) — confirms the credential setup itself works before building anything more complex.
3. Build `add_source` + `poll_rss_sources`, add one real channel, confirm posts land in `posts`.
4. Build `deduplicate_posts` + `classify_with_claude`, confirm a `news_items` row appears with sane output.
5. Build `send_instant_alerts` + `daily_digest`, confirm a message actually arrives in Telegram.
6. Build `telegram_commands` + `manage_interests`, run the full command checklist against both the allowed account and a second, non-allowed one.
7. Set every workflow's **Error Workflow** to `error_handler`, build it, and deliberately break something (stop a container) to confirm it fires.
