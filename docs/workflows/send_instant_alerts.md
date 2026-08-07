# Workflow: send_instant_alerts

## Purpose

Send a `news_item` to the user immediately once it's classified, if it's important/relevant enough not to wait for the daily digest: `importance >= 3 AND relevance >= 0.75 AND is_advertisement = false`, and it hasn't already been sent.

## Trigger

**Schedule Trigger** — every 2 minutes (frequent, since "instant" implies low latency; classification itself only runs every ~10 minutes, so this doesn't need to be much faster than that).

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query** — eligible, not-yet-sent items:
   ```sql
   SELECT ni.id, ni.canonical_title, ni.summary, ni.why_it_matters, ni.categories,
          ni.importance, ni.relevance,
          (SELECT p.post_url FROM news_sources ns JOIN posts p ON p.id = ns.post_id
           WHERE ns.news_item_id = ni.id ORDER BY ns.created_at LIMIT 1) AS source_url
   FROM news_items ni
   LEFT JOIN deliveries d ON d.news_item_id = ni.id
     AND d.telegram_user_id = $1 AND d.delivery_type = 'instant'
   WHERE ni.importance >= 3 AND ni.relevance >= 0.75 AND ni.is_advertisement = false
     AND d.id IS NULL
   ORDER BY ni.processed_at
   LIMIT 20;
   ```
3. **Split In Batches** (batch size 1).
4. **Postgres — Insert (reserve)**: `INSERT INTO deliveries (news_item_id, telegram_user_id, delivery_type) VALUES ($1, $2, 'instant') ON CONFLICT (news_item_id, telegram_user_id, delivery_type) DO NOTHING RETURNING id`.
5. **IF** — 0 rows returned (another run already reserved/sent this item — e.g. an overlapping execution)?
   - **true** → skip, loop to step 3.
   - **false** → continue with the reservation's `id`.
6. **Code** — format the single-item message: `⚡ Важная новость\n\n{{canonical_title}}\n{{summary}}\nПочему важно: {{why_it_matters}}\nИсточник: {{source_url}}` (same item shape as the digest, just without category grouping — one item, sent alone).
7. **Telegram — Send Message** to `TELEGRAM_ALLOWED_USER_ID`. `retryOnFail: true`, `maxTries: 3`.
8. **IF** — send succeeded?
   - **true** → **Postgres — Update**: `UPDATE deliveries SET delivered_at = now(), telegram_message_id = $1 WHERE id = $2`.
   - **false** → **Postgres — Delete**: `DELETE FROM deliveries WHERE id = $1` (releases the reservation so this item is picked up again next cycle instead of being silently stuck forever) → **Postgres — Insert** into `workflow_logs` (`level = 'error'`).
9. Loop to step 3 for the next item; once exhausted, workflow ends.

## Output

None (sends a Telegram message; writes `deliveries`/`workflow_logs`).

## Error handling

A Telegram send failure releases the reservation (step 8, false branch) rather than leaving a dangling reserved-but-undelivered row that would silently block the item forever (since step 2's `d.id IS NULL` check would otherwise treat any existing row, delivered or not, as "already handled"). Unexpected DB failures propagate to `error_handler`.

## Retries

Telegram send: 3 tries, n8n's built-in fixed-interval retry.

## Anti-duplicate protection

This is the canonical use of the `deliveries` reserve pattern (see `db/README.md`): **reserve before send**. The `UNIQUE(news_item_id, telegram_user_id, delivery_type)` constraint plus `ON CONFLICT DO NOTHING RETURNING id` means only one execution can ever win the reservation for a given item, even if two runs overlap — the loser gets 0 rows back and skips, never sends.
