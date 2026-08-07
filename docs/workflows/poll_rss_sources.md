# Workflow: poll_rss_sources

## Purpose

Every 10 minutes, fetch new publications from every `active` source's RSS feed (self-hosted RSSHub), normalize each post via `helper-api`, and persist it — relying on the `posts` table's DB constraints (not application logic) to make re-processing the same feed window safe.

## Trigger

**Schedule Trigger** — cron `*/10 * * * *`. `GENERIC_TIMEZONE=Asia/Bishkek` is already set at the n8n-container level (`docker-compose.yml`), so cron expressions run in that timezone.

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger** — every 10 minutes.
2. **Postgres — Execute Query**: `SELECT id, rss_url, channel_username, error_count FROM sources WHERE status = 'active' ORDER BY last_checked_at NULLS FIRST`.
3. **Split In Batches** (batch size 1) — process sources one at a time rather than firing every request simultaneously. Mitigates RSSHub's own IP getting rate-limited by Telegram's `t.me/s/` frontend when many channels are polled at once (see `docs/decisions/`).
4. **Wait** (~2s) — inside the loop, before each fetch, staggering requests further.
5. **HTTP Request** — `GET {{ $json.rss_url }}`, timeout 10s, `retryOnFail: true`, `maxTries: 3`, `onError: continueRegularOutput` (don't abort the whole batch on one bad source).
6. **IF** — request succeeded (2xx + parseable RSS)?
   - **false** (failure branch):
     a. **Postgres — Update**: `UPDATE sources SET last_checked_at = now(), error_count = error_count + 1, status = CASE WHEN error_count + 1 >= 5 THEN 'error' ELSE status END WHERE id = $1` (a source only flips to `error` after 5 consecutive failures — a single transient RSSHub hiccup shouldn't take a channel offline).
     b. **Postgres — Insert** into `workflow_logs` (`workflow_name = 'poll_rss_sources'`, `level = 'warn'`, `message`, `metadata = { sourceId, rssUrl }`).
     c. → back to step 3 (next source).
   - **true** (success branch): continue to step 7.
7. **RSS Feed Read** (parses the already-fetched body; or an **XML** node if raw parsing is preferred) → one item per feed entry.
8. **Split In Batches** (batch size 1) — one post at a time.
9. **HTTP Request** — `POST {{HELPER_API_URL}}/normalize` with `{ "text": $json.contentSnippet ?? $json.content }` → `{ normalizedText, contentHash }`.
10. **Postgres — Insert**:
    ```sql
    INSERT INTO posts (source_id, external_id, post_url, title, raw_text,
                        normalized_text, content_hash, published_at, media_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT DO NOTHING
    RETURNING id
    ```
    No explicit conflict target — this table has two independent uniqueness guards (`post_url`, and the partial `(source_id, external_id) WHERE external_id IS NOT NULL`); an unqualified `ON CONFLICT DO NOTHING` absorbs a violation of either one. `external_id` is the feed entry's `<guid>` when present, else `NULL`.
11. Back to step 8 for the next post in this source's feed; once exhausted:
12. **Postgres — Update**: `UPDATE sources SET last_checked_at = now(), last_success_at = now(), error_count = 0, status = CASE WHEN status = 'error' THEN 'active' ELSE status END WHERE id = $1` — a source that recovers automatically flips back to `active` on its next successful fetch, no manual `/resume_source` needed.
13. Back to step 3 for the next source; once exhausted, workflow ends.

## Output

None (writes directly to `posts`/`sources`/`workflow_logs`).

## Error handling

- Per-source HTTP failures are caught explicitly (step 6) and logged, not thrown — one bad feed never stops the batch.
- Unexpected node failures (Postgres down, helper-api down) propagate to n8n's workflow error trigger → `error_handler` (Stage J), which also updates `workflow_logs`.
- After 5 consecutive failures a source is auto-flagged `error` and stops being polled until `/resume_source` or a future manual/automatic recovery check.

## Retries

HTTP fetch: 3 tries per source per run, n8n's built-in fixed-interval retry (not exponential — see `docs/decisions/`). Across runs, the 10-minute cron interval itself acts as the outer retry loop for transient failures.

## Anti-duplicate protection

Deliberately **not** application-level ("have I seen this before?" lookups) — it's DB-level, via the `posts.post_url` and `posts.(source_id, external_id)` constraints plus `ON CONFLICT DO NOTHING`. This makes the workflow safe to re-run, safe against overlapping executions (if a run takes longer than 10 minutes and a second one starts), and safe against RSS feeds that always return their last N items rather than only new ones.
