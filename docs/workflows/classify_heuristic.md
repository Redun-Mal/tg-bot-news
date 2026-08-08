# Workflow: classify_heuristic

## Purpose

A free, non-AI stand-in for `classify_with_claude`, added because a real `CLAUDE_API_KEY` wasn't available. Unblocks the whole delivery pipeline (`send_instant_alerts`, `daily_digest`) using keyword matching instead of understanding — same output contract, same downstream tables, same dedup logic. Both workflows can coexist: activate `classify_with_claude` instead (and deactivate this one) whenever a Claude key exists, with zero changes needed anywhere downstream.

Honest about its limits: importance is only ever 2 or 3 (never assumes something is critical, never buries it as trivial), confidence is a fixed 0.5, summaries are truncated raw text rather than written, and relevance is a blunt "did a user-interest keyword appear" signal — see `helper-api`'s `heuristicClassify` (`services/helper-api/src/lib/heuristic-classify.ts`) for the exact rules.

## Trigger

**Schedule Trigger** — every 10 minutes, same offset intent as `classify_with_claude`.

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query** (`User interests`): `SELECT interest FROM user_interests WHERE telegram_user_id = $1`, `alwaysOutputData: true` (zero interests is a legitimate state — the aggregate step below still needs to run).
3. **Aggregate** (`aggregateIndividualFields`, field `interest`) — combines all interest rows into one item: `{ interest: [...] }`.
4. **Postgres — Execute Query** (`Unresolved posts`): same query as `classify_with_claude` — posts with no `news_sources` row yet, oldest first, `LIMIT 50`.
5. **HTTP Request** (`Filter check`) — `POST {{ $env.HELPER_API_URL }}/filter-check`, same as `classify_with_claude`.
6. **IF** (`Keep?`):
   - **false**: same filtered-out branch as `classify_with_claude` — synthetic already-resolved `news_items` row (`is_advertisement = true`), linked via `news_sources`, so the post is never reprocessed.
   - **true**: continue.
7. **HTTP Request** (`Heuristic classify`) — `POST {{ $env.HELPER_API_URL }}/classify-heuristic` with `{ title, rawText, interests: $('Aggregate interests').first().json.interest }` (`.first()` is safe here — the interests list is the same for every post in the batch, not a per-post pairedItem lookup).
8. **Postgres — Execute Query** (`Level-4 dedup check`) — **self-contained**: echoes every classification field back as literal `SELECT`-list columns (`$1::text AS title, ...`) alongside a correlated subquery for the dedup match (`(SELECT id FROM news_items WHERE ... ) AS matched_news_item_id`), rather than relying on a later node reaching back via `pairedItem`. See "n8n JSON" below for why.
9. **IF** (`Level-4 match?`) — `$json.matched_news_item_id != null` (not `!== undefined` — a SQL `NULL` comes back as JS `null`, and `null !== undefined` is `true`, which would silently invert this check).
   - **true**: **Postgres — Insert** (`Link to existing news_item`) — `INSERT INTO news_sources (news_item_id, post_id) VALUES ($1, $2) ON CONFLICT (post_id) DO NOTHING`, both values read directly from `$json` (no pairedItem needed — step 8 already carries everything).
   - **false**: **Postgres — Insert** (`Insert new news_item`) — a single query using a CTE that both inserts the `news_items` row and links it via `news_sources` in one round trip: `WITH new_item AS (INSERT INTO news_items (...) VALUES (...) RETURNING id) INSERT INTO news_sources (news_item_id, post_id) SELECT id, $12 FROM new_item RETURNING news_item_id`.

## Output

None (writes `news_items`/`news_sources`).

## Error handling

Same as `classify_with_claude`: filtered-out and dedup-matched posts are normal branches. Unexpected failures propagate to `error_handler` (this workflow's Error Workflow is set the same way).

## Retries

None needed — no external API call to retry (helper-api is a local, reliable dependency).

## Anti-duplicate protection

Same three layers as `classify_with_claude`: `deduplicate_posts` catches most re-posts before this workflow ever sees them; step 8/9 here is the level-4 (post-classification) catch; `news_sources.post_id UNIQUE` is the final backstop.

## n8n JSON

`n8n/workflows/classify_heuristic.json` is **verified live**: run twice against the full real backlog (69 unresolved posts across the user's 4 real channels), producing 51+ real `news_items` with no errors on the final version. Getting there surfaced a real n8n limitation beyond `docs/decisions/005-n8n-postgres-node-quirks.md`'s existing ten: a `pairedItem` lookup (`$('NodeName').item.json...`) reaching back **across** a node with `alwaysOutputData: true`, when processing a batch of ~50 items, threw `ExpressionError: Multiple matching items for expression` / `paired_item_multiple_matches` — a _different_, harder failure than Quirk 4/10's "missing pairedItem" cases, and one that survived even a single-hop lookback immediately after the problem node. The fix that actually worked: make the `alwaysOutputData` node's own query **self-contained** — have it `SELECT` back every field anything downstream needs as literal passthrough columns (`$1::text AS title, ...`) alongside whatever it's actually looking up, so nothing after it ever needs `pairedItem` to reach across that specific node at all. Also caught a real logic bug of its own (not n8n's fault): checking `$json.matched_news_item_id !== undefined` treated SQL `NULL` (which arrives as JS `null`, not `undefined`) as "match found," silently inverting the dedup branch — fixed with `!= null`, which catches both.
