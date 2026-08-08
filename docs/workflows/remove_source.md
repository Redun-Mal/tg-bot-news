# Workflow: remove_source

## Purpose

Handle `/remove_source <id|url>`. **Soft-delete only** — sets `status = 'removed'`, never `DELETE`s the row, so existing `posts`/`news_items` history tied to the source via foreign keys stays intact (matches the DB design in `db/README.md`).

## Trigger

**Execute Workflow Trigger**, called by `telegram_commands`.

## Input

```json
{ "telegramUserId": 123456789, "idOrUrl": "example_channel" }
```

`idOrUrl` may be a numeric `sources.id`, a bare channel username, or a full `t.me/...` URL.

## Node sequence

1. **Execute Workflow Trigger**.
2. **Code** — classify `idOrUrl`: if it's all digits, treat as `id`; else if it matches the `t.me/<username>` pattern, extract `channelUsername`; else treat the raw string as `channelUsername` (so users can just type the bare name).
3. **Postgres — Execute Query**: `SELECT id, status FROM sources WHERE (id = $1 OR channel_username = $2) AND status != 'removed'` (parameterized; whichever of `id`/`channelUsername` is null is matched with `IS NULL`-safe `= $1` via `COALESCE`/explicit branching in the query builder).
4. **IF** — row found?
   - **false** → **Set** (`message` = `"Источник не найден или уже удалён."`).
   - **true** → **Postgres — Update**: `UPDATE sources SET status = 'removed', updated_at = now() WHERE id = $1` → **Set** (`message` = `"Источник удалён: {{channel_username}}"`).
5. **NoOp** (join) → return `{ message }`.

## Output

```json
{ "message": "Источник удалён: example_channel" }
```

## Error handling

DB errors propagate to `error_handler`. A not-found/already-removed source is a normal branch, not an error.

## Retries

None needed — a single idempotent UPDATE.

## Anti-duplicate / idempotency protection

Re-running `/remove_source` on an already-removed source is a no-op: step 3's `AND status != 'removed'` makes it fall into the "not found" branch rather than re-updating, so the user gets a clear "already removed" style message instead of a silent success that implies something changed.

## n8n JSON

`n8n/workflows/remove_source.json` is **verified**: built and executed against a real n8n instance, both branches confirmed (existing source correctly soft-deleted, and idempotent re-run correctly falls into the "not found" branch). Built applying the fixes in `docs/decisions/005-n8n-postgres-node-quirks.md` from the start — no new issues found.
