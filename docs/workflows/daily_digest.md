# Workflow: daily_digest

## Purpose

Once a day, send everything from the last 24 hours that hasn't already been delivered (by either `send_instant_alerts` or a previous digest run), grouped by category, respecting the 5-per-category / 25-total caps and Telegram's message-length limit.

## Trigger

**Schedule Trigger** — cron `0 9 * * *`. `GENERIC_TIMEZONE=Asia/Bishkek` is set at the n8n-container level (`docker-compose.yml`), so this fires at 09:00 Bishkek time. (Bishkek has no DST, so this stays correct year-round without adjustment.)

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query** — eligible, not-yet-sent-by-any-method items from the last 24h:
   ```sql
   SELECT ni.id, ni.canonical_title, ni.summary, ni.why_it_matters, ni.categories,
          ni.importance, ni.relevance,
          (SELECT p.post_url FROM news_sources ns JOIN posts p ON p.id = ns.post_id
           WHERE ns.news_item_id = ni.id ORDER BY ns.created_at LIMIT 1) AS source_url
   FROM news_items ni
   LEFT JOIN deliveries d ON d.news_item_id = ni.id AND d.telegram_user_id = $1
   WHERE ni.processed_at > now() - interval '24 hours'
     AND ni.is_advertisement = false
     AND d.id IS NULL
   ORDER BY ni.importance DESC, ni.relevance DESC;
   ```
   Deliberately checks **any** `delivery_type`, not just `'digest'` — importance/relevance only ever gate _instant_ eligibility (`send_instant_alerts.md`); a borderline item (say, `importance = 3` but `relevance = 0.6`, which qualifies for neither the literal "instant" rule nor a clean "importance 1-2" digest bucket) must still end up _somewhere_. Checking against every delivery type, rather than trying to keep the two buckets perfectly disjoint by importance alone, is what actually guarantees "never send the same news twice" — the spec's stronger, overriding rule.
3. **IF** — zero rows?
   - **true** → **Telegram — Send Message**: `"📰 Сегодня новостей нет."` → end.
   - **false** → continue.
4. **Split In Batches** (batch size 1) over the selected items.
5. **Postgres — Insert (reserve)**: `INSERT INTO deliveries (news_item_id, telegram_user_id, delivery_type) VALUES ($1, $2, 'digest') ON CONFLICT (news_item_id, telegram_user_id, delivery_type) DO NOTHING RETURNING id`. Keep the item only if a row came back (guards the same overlapping-run race as `send_instant_alerts`); drop it otherwise.
6. **Aggregate** (n8n Aggregate/Merge node) — collect all successfully-reserved items (with their reservation `id`s) back into one array.
7. **HTTP Request** — `POST {{HELPER_API_URL}}/format-digest` with `{ items: [...] }` (mapped to the shape `formatDigest` expects: `title, summary, whyItMatters, categories, importance, relevance, sourceUrl`) → `{ messages: string[] }`.
8. **Split In Batches** (batch size 1) over `messages`.
9. **Wait** (~1.5s) — before each send, to stay under Telegram's per-chat flood-control limit (~1 msg/sec) when a digest spans multiple messages.
10. **Telegram — Send Message** — `retryOnFail: true`, `maxTries: 3`.
11. Loop to step 9 for the next message.
12. **IF** — did every message send successfully?
    - **true** → **Postgres — Update**: `UPDATE deliveries SET delivered_at = now() WHERE id = ANY($1)` (bulk-confirm all reserved rows from step 5/6). `telegram_message_id` is left `NULL` for digest deliveries — one Telegram message can bundle many `news_items`, so there's no single message ID to attribute to any one item; the column is nullable specifically for this case.
    - **false** → **Postgres — Delete**: `DELETE FROM deliveries WHERE id = ANY($1) AND delivered_at IS NULL` (releases every reservation from this run, so nothing gets silently stuck — a botched digest is retried in full next time rather than partially, since there's no per-item send confirmation to know which specific items actually reached the user) → **Postgres — Insert** into `workflow_logs` (`level = 'error'`).

## Output

None (sends one or more Telegram messages; writes `deliveries`/`workflow_logs`).

## Error handling

A failure partway through a multi-message digest releases **all** of this run's reservations (step 12, false branch), not just the ones for messages that didn't send — there's no reliable way to know from the outside which underlying `news_items` ended up in which successfully-sent chunk, so "retry everything tomorrow" is the only correctness-preserving choice available without much more bookkeeping. Unexpected DB failures propagate to `error_handler`.

## Retries

Each Telegram send: 3 tries, n8n's built-in fixed-interval retry. The `Wait` node between sends is a rate-limit precaution, not a retry mechanism.

## Anti-duplicate protection

Same reserve-before-send pattern as `send_instant_alerts`, applied per-item at step 5 before any formatting/sending happens — an item that already has _any_ delivery row (instant or digest) never reaches `/format-digest` in the first place, and the `UNIQUE(news_item_id, telegram_user_id, delivery_type)` constraint is the hard backstop against overlapping runs.

## n8n JSON

`n8n/workflows/daily_digest.json` is **verified for the no-news, selection, reservation, and failure-release paths**: confirmed the no-news branch fires on an empty table, an eligible item is correctly reserved and formatted through a real `/format-digest` call, and — sending to a deliberately-invalid `chat_id` — the failure path correctly bulk-released the reservation and logged the error. This surfaced a real gap beyond `docs/decisions/005-n8n-postgres-node-quirks.md`: the original design only handled Telegram-send failure, not a failure of the `/format-digest` HTTP call itself — an early test confirmed a `Format digest` failure left its reservation permanently stuck (no release path reached it at all), fixed by adding the same `onError: continueErrorOutput` branch to that node too. **Known untested gap**: true all-or-nothing semantics for a _partial_ failure across a multi-message digest (some chunks send, one doesn't) aren't fully guaranteed by the current wiring — `Send digest message`'s success and failure outputs both fire independently per item, so a mixed outcome would trigger both the confirm and release branches in the same run rather than one or the other. Not exercised here since the test digest only produced one message. The **success/confirm path** (a real message actually arriving) is also unverified — needs a real `TELEGRAM_ALLOWED_USER_ID`.
