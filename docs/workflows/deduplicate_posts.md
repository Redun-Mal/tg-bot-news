# Workflow: deduplicate_posts

## Purpose

Before any post reaches the (paid, slower) `classify_with_claude` workflow, check whether it's a duplicate/re-post of something **already classified** — if so, just link it to the existing `news_item` via `news_sources` instead of spending a Claude call and creating a redundant item. This is dedup levels 1–3 from the spec (external ID and URL are already handled for free by `posts`' own unique constraints at insert time — see `poll_rss_sources.md`; this workflow adds level 3, content-hash/similarity matching, which needs cross-post comparison logic a plain `INSERT ... ON CONFLICT` can't express).

Level 4 (post-AI title/summary similarity) is **not** done here — it needs Claude's own `canonical_title`/`summary` output to compare against, so it happens as part of `classify_with_claude` (Stage G), as a check against recently-created `news_items` before inserting a new one.

## Trigger

**Schedule Trigger** — runs shortly after each `poll_rss_sources` cycle (e.g. every 10 minutes, offset by 2 minutes) so newly-ingested posts get a chance to be deduped before classification picks them up. Alternative considered and rejected: chaining directly off `poll_rss_sources` via Execute Workflow — kept as a separate cron instead so a slow dedup pass never blocks the next ingestion poll.

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query** — find unresolved posts (no `news_sources` row yet) that are old enough to have a full RSS description settled (small delay avoids racing a feed that edits a post moments after publishing):
   ```sql
   SELECT p.id, p.title, p.normalized_text, p.content_hash
   FROM posts p
   LEFT JOIN news_sources ns ON ns.post_id = p.id
   WHERE ns.id IS NULL
     AND p.fetched_at < now() - interval '1 minute'
   ORDER BY p.fetched_at
   LIMIT 100;
   ```
3. **Split In Batches** (batch size 1).
4. **Postgres — Execute Query** — look for a match among posts that are **already linked** to a `news_item` (i.e. already resolved), within a 48-hour window (matching against week-old news is pointless and just wastes a scan):
   ```sql
   SELECT ns.news_item_id, p2.id AS matched_post_id,
          similarity(p2.normalized_text, $1) AS text_sim,
          similarity(p2.title, $2) AS title_sim
   FROM posts p2
   JOIN news_sources ns ON ns.post_id = p2.id
   WHERE p2.fetched_at > now() - interval '48 hours'
     AND (
       p2.content_hash = $3
       OR similarity(p2.normalized_text, $1) > 0.6
       OR similarity(p2.title, $2) > 0.5
     )
   ORDER BY text_sim DESC
   LIMIT 1;
   ```
   (`$1` = candidate's `normalized_text`, `$2` = candidate's `title`, `$3` = candidate's `content_hash`. Requires the `pg_trgm` extension, already enabled by `db/migrations/1700000000000_extensions.js`, plus a trigram GIN index on `posts.normalized_text`/`posts.title` — see note below.)
5. **IF** — match found?
   - **true** → **Postgres — Insert**: `INSERT INTO news_sources (news_item_id, post_id) VALUES ($1, $2) ON CONFLICT (post_id) DO NOTHING` — links this post to the existing item. No Claude call, no new `news_items` row.
   - **false** → do nothing; this post stays unresolved and becomes a candidate for `classify_with_claude` (Stage G).
6. Back to step 3 for the next post; once exhausted, workflow ends.

## Output

None (writes `news_sources` rows for resolved duplicates; leaves the rest untouched for Stage G to pick up).

## Error handling

DB errors propagate to `error_handler`. A post that matches nothing is not an error — it's the expected common case (most posts are genuinely new).

## Retries

None needed — read-then-conditional-insert, safe to retry on the next scheduled run if something fails mid-batch (posts without a `news_sources` row are simply picked up again next cycle).

## Anti-duplicate protection

`news_sources.post_id UNIQUE` (already established in Stage B) is the hard guarantee: even if this workflow's similarity query somehow matched the same post twice across overlapping runs, only the first `INSERT` would succeed — the `ON CONFLICT (post_id) DO NOTHING` makes the second a no-op rather than a duplicate link or an error.

## Note: trigram indexes

Add (in a follow-up migration, once this workflow is actually implemented — not needed for the MVP's initial volume, called out here so it isn't forgotten):

```sql
CREATE INDEX posts_normalized_text_trgm_idx ON posts USING gin (normalized_text gin_trgm_ops);
CREATE INDEX posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);
```

Without these, `similarity()` still works correctly, just as a sequential scan — fine at MVP scale (single user, modest channel count), worth adding once post volume grows enough for it to matter.

## n8n JSON

`n8n/workflows/deduplicate_posts.json` is **verified**: built and executed against a real n8n instance. Confirmed live: a near-duplicate post from a different channel correctly matched (0.63 text / 0.61 title similarity) and linked into the existing `news_item` via `news_sources`; a genuinely unrelated post correctly found no match and stayed unresolved. No new n8n quirks beyond `docs/decisions/005-n8n-postgres-node-quirks.md` — applying all four from the start again meant this workflow worked on the first real execution.
