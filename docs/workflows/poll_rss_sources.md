# Workflow: poll_rss_sources

## Purpose

Every 10 minutes, fetch new publications from every `active` source's RSS feed (self-hosted RSSHub), normalize each post via `helper-api`, and persist it — relying on the `posts` table's DB constraints (not application logic) to make re-processing the same feed window safe.

## Trigger

**Schedule Trigger** — cron `*/10 * * * *`. `GENERIC_TIMEZONE=Asia/Bishkek` is already set at the n8n-container level (`docker-compose.yml`), so cron expressions run in that timezone.

## Input

None (self-triggered).

## Node sequence

Simpler than originally spec'd: n8n auto-iterates regular (non-trigger) nodes once per input item by default, so **no explicit per-source loop node is needed at all** — only the source→feed-item fan-out (1 source producing N posts) needs an explicit loop-like construct, handled by a single **Run Once for All Items** Code node. See `docs/decisions/005-n8n-postgres-node-quirks.md` for why the original nested-`Split In Batches` design didn't survive contact with a live instance.

1. **Schedule Trigger** — every 10 minutes.
2. **Postgres — Execute Query** (`Active sources`): `SELECT id, rss_url, channel_username FROM sources WHERE status = 'active' ORDER BY last_checked_at NULLS FIRST`. If this returns 0 rows, everything downstream simply doesn't run — the correct behavior (nothing to poll), no `alwaysOutputData` needed here.
3. **HTTP Request** (`Fetch RSS feed`) — `GET {{ $json.rss_url }}`, timeout 10s, `continueOnFail: true`. Auto-iterates once per source. **Its output replaces `$json` entirely** — every later node needing the source's `id` must look it up via `$('Active sources').item.json.id` (pairedItem) rather than `$json.id`, which is `undefined` past this point (see decisions doc, Quirk 4).
4. **IF** (`Fetch succeeded?`) — boolean expression `$json.error === undefined`, not a `notExists` operator (Quirk 3). Two outputs, both fed by every item:
   - **false** (failure): **Postgres — Update** (`Record fetch failure`): `UPDATE sources SET last_checked_at = now(), error_count = error_count + 1, status = CASE WHEN error_count + 1 >= 5 THEN 'error' ELSE status END WHERE id = $1` (params via `$('Active sources').item.json.id`) → **Postgres — Insert** (`Log fetch failure`) into `workflow_logs`.
   - **true** (success), two parallel branches off the same output:
     a. **Postgres — Update** (`Record fetch success`): `UPDATE sources SET last_checked_at = now(), last_success_at = now(), error_count = 0, status = CASE WHEN status = 'error' THEN 'active' ELSE status END WHERE id = $1` — a recovered source flips back to `active` automatically, no manual `/resume_source` needed.
     b. **Code, Run Once for All Items** (`Parse feed items`): zips `$('Active sources').all()` against `$input.all()` by array index (not `.item` — this mode breaks 1:1 pairing) to recover each response's `sourceId`, regex-extracts `<item>...</item>` blocks (`title`, `link`, `guid`, `description`, `pubDate`), and returns a **flattened array across all sources** — the actual fan-out step.
5. **HTTP Request** (`Normalize text`) — `POST {{ $env.HELPER_API_URL }}/normalize` with `{ text: $json.description }`, auto-iterates once per feed item.
6. **Code, Run Once for Each Item** (`Merge normalized fields`) — `{ ...$('Parse feed items').item.json, normalizedText: $json.normalizedText, contentHash: $json.contentHash }` (pairedItem lookup again, this time safe since both nodes are per-item).
7. **Postgres — Insert** (`Insert post`):
   ```sql
   INSERT INTO posts (source_id, external_id, post_url, title, raw_text,
                       normalized_text, content_hash, published_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7, NULLIF($8, '')::timestamptz)
   ON CONFLICT DO NOTHING
   RETURNING id
   ```
   No explicit conflict target — this table has two independent uniqueness guards (`post_url`, and the partial `(source_id, external_id) WHERE external_id IS NOT NULL`); an unqualified `ON CONFLICT DO NOTHING` absorbs a violation of either one. `external_id` is the feed entry's `<guid>` when present, else `NULL`. Query Parameters use the array-expression form (Quirk 2), not comma-joined blocks.
8. Workflow ends — every branch above runs to completion independently per item, nothing to explicitly loop back to.

## Output

None (writes directly to `posts`/`sources`/`workflow_logs`).

## Error handling

- Per-source HTTP failures are caught explicitly (step 4, `continueOnFail`) and logged, not thrown — one bad feed never stops the rest.
- Unexpected node failures (Postgres down, helper-api down) propagate to n8n's workflow error trigger → `error_handler` (Stage J), which also updates `workflow_logs`.
- After 5 consecutive failures a source is auto-flagged `error` and stops being polled until `/resume_source` or a future successful fetch.

## Retries

No per-fetch `retryOnFail` in the verified build (a gap from the original spec, not re-tested after the fact) — a transient failure increments `error_count` and is picked up again on the next 10-minute cycle, which acts as the practical outer retry loop. Add `retryOnFail: true, maxTries: 3` to the `Fetch RSS feed` node for tighter within-run retry if a single 10-minute wait proves too slow in practice.

## Anti-duplicate protection

Deliberately **not** application-level ("have I seen this before?" lookups) — it's DB-level, via the `posts.post_url` and `posts.(source_id, external_id)` constraints plus `ON CONFLICT DO NOTHING`. This makes the workflow safe to re-run, safe against overlapping executions (if a run takes longer than 10 minutes and a second one starts), and safe against RSS feeds that always return their last N items rather than only new ones.

## n8n JSON

`n8n/workflows/poll_rss_sources.json` is **verified**: built and executed against a real n8n instance against a real public channel (`t.me/telegram`) via the live RSSHub service — 20 real posts inserted with correct `source_id`/`content_hash`/`normalized_text`, source metadata (`last_checked_at`/`last_success_at`/`error_count`/`status`) updated correctly, a re-run confirmed as a true no-op (post count unchanged, `ON CONFLICT DO NOTHING` doing its job for real, not just in isolated SQL testing), and the failure branch confirmed against a genuinely unreachable feed (`error_count` incremented, a real `workflow_logs` row written). This was the workflow that surfaced Quirk 4 (HTTP node output losing original item fields) — see `docs/decisions/005-n8n-postgres-node-quirks.md`.
