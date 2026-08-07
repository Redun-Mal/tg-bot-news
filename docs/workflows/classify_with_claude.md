# Workflow: classify_with_claude

## Purpose

For every post that survived `deduplicate_posts` unresolved (no existing `news_item` matched it), apply the pre-Claude filter, then call Claude for categorization/summarization, validate the response against the exact spec contract, run the last dedup check (level 4 — title/summary similarity against recently-created `news_items`), and either merge into an existing item or create a new one.

This is also where `filterCheck` (Stage D, `POST /filter-check`) actually gets invoked — no earlier workflow calls it. Empty/too-short/ad/giveaway/promo-code posts are filtered out **here**, immediately before the point where they'd otherwise cost a Claude call.

## Trigger

**Schedule Trigger** — every 10 minutes, offset a couple of minutes after `deduplicate_posts` so it only ever sees posts that dedup has already had a chance to resolve for free.

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query** — unresolved posts (same shape as `deduplicate_posts` step 2, reused after that workflow has had its pass): `SELECT p.id, p.title, p.raw_text, p.normalized_text, p.post_url FROM posts p LEFT JOIN news_sources ns ON ns.post_id = p.id WHERE ns.id IS NULL ORDER BY p.fetched_at LIMIT 50;`
3. **Split In Batches** (batch size 1).
4. **HTTP Request** — `POST {{HELPER_API_URL}}/filter-check` with `{ normalizedText: $json.normalized_text }`.
5. **IF** — `keep == false`?
   - **true** (filtered out): **Postgres — Insert** a synthetic, already-resolved `news_items` row so this post is never reprocessed and never delivered to the user:
     ```sql
     INSERT INTO news_items (canonical_title, summary, categories, importance, relevance,
                              confidence, language, keywords, is_advertisement, is_duplicate, processed_at)
     VALUES ($1, $2, '{other}', 1, 0, 1, 'ru', '{}', true, false, now())
     RETURNING id;
     ```
     (`$1`/`$2` = post title / `"Отфильтровано до анализа: {{reason}}"`.) Then **Postgres — Insert** `news_sources (news_item_id, post_id)`. Loop to next post (step 3).
   - **false**: continue to step 6.
6. **Postgres — Execute Query** — current `user_interests` for `TELEGRAM_ALLOWED_USER_ID` (feeds the prompt so Claude can weigh relevance against what the user actually cares about).
7. **Code** — build the Claude request. System prompt fixes the category enum (`world, technology, programming, gaming, roblox, business, central_asia, other`), the exact output contract, and the rules from the spec (no invented facts, separate opinion from fact, note incompleteness, keep the original link, translate non-Russian summaries to Russian, don't translate product/library/company/game names). User content is **only** the post's `title` + `raw_text` + the interests list from step 6 — never DB credentials, tokens, `.env` values, or any other internal configuration.
8. **HTTP Request** — `POST https://api.anthropic.com/v1/messages`, model from `CLAUDE_MODEL` env var, **forced structured output**: pass a `tools` array with one tool whose `input_schema` is the classification contract, and `tool_choice: { type: "tool", name: "classify_post" }` — this is materially more reliable than a "please output only JSON" instruction, since the model literally cannot emit prose instead of the schema. `Authorization` header sourced from an n8n credential (never inlined in the workflow JSON). `retryOnFail: true`, `maxTries: 3`, timeout 30s.
9. **Code** — extract the tool-call input (the JSON) from Claude's response body.
10. **HTTP Request** — `POST {{HELPER_API_URL}}/validate-classification` with `{ rawResponse: <the extracted JSON as a string> }`.
11. **IF** — `valid == false`?
    - **true**: **Postgres — Insert** into `workflow_logs` (`level = 'error'`, `metadata = { postId, errors }`). Post stays unresolved — picked up again next cycle. Loop to next post. (A response that's malformed every single cycle would retry forever at MVP scale; acceptable for a single-user system with modest volume — worth revisiting only if it turns out to happen often in practice.)
    - **false**: continue to step 12.
12. **Postgres — Execute Query** — level-4 dedup: does a recent (48h) `news_item` already cover this story, per Claude's _own_ title/summary rather than the raw post text?
    ```sql
    SELECT id FROM news_items
    WHERE created_at > now() - interval '48 hours'
      AND (similarity(canonical_title, $1) > 0.5 OR similarity(summary, $2) > 0.5)
    ORDER BY similarity(canonical_title, $1) DESC
    LIMIT 1;
    ```
13. **IF** — match found?
    - **true**: **Postgres — Insert** `news_sources (news_item_id, post_id) VALUES (<matched id>, <post id>) ON CONFLICT (post_id) DO NOTHING`.
    - **false**: **Postgres — Insert** a new `news_items` row from the validated classification (`canonical_title = title`, `processed_at = now()`, all other fields mapped 1:1) `RETURNING id`, then **Postgres — Insert** `news_sources (news_item_id, post_id)` linking the seed post.
14. Loop to step 3 for the next post; once exhausted, workflow ends.

## Output

None (writes `news_items`/`news_sources`/`workflow_logs`).

## Error handling

- Filtered-out posts (step 5) and dedup-matched posts (step 13) are normal branches, not errors.
- A malformed/schema-invalid Claude response (step 11) is logged and the post is left unresolved rather than crashing the batch — one bad response never blocks the rest.
- Claude API errors (5xx, timeout, rate limit) are retried (step 8); after retries are exhausted the node error propagates to n8n's error trigger → `error_handler`, and the post is naturally retried on the next scheduled run.

## Retries

Claude call: 3 tries, n8n's built-in fixed-interval retry (not exponential — see `docs/decisions/`).

## Anti-duplicate protection

Three layers stack here: `deduplicate_posts` already caught most re-posts before this workflow ever sees them (levels 1–3); step 12/13 catches the ones that slipped through because pre-AI text similarity missed a paraphrase, using Claude's own cleaned-up title/summary instead (level 4); and `news_sources.post_id UNIQUE` (Stage B) is the final backstop against any race between overlapping runs.

## Cost control

The `filter-check` pass (step 4-5) and `deduplicate_posts` (prior workflow) both exist specifically to minimize how many posts ever reach step 8 — the only step with a real dollar cost. `CLAUDE_MODEL` defaults to a cheap/fast tier (`.env.example`); escalate only if classification quality proves insufficient in practice.
