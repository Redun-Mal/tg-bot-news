# Workflow: pause_source

## Purpose

Handle `/pause_source <id>` — temporarily stop polling a source without removing it. `poll_rss_sources` only queries `status = 'active'`, so a paused source is simply skipped until resumed.

## Trigger

**Execute Workflow Trigger**, called by `telegram_commands`.

## Input

```json
{ "telegramUserId": 123456789, "id": 4 }
```

## Node sequence

1. **Execute Workflow Trigger**.
2. **Postgres — Execute Query**: `SELECT id, status, channel_username FROM sources WHERE id = $1`.
3. **IF** — row found?
   - **false** → **Set** (`message` = `"Источник с таким id не найден."`).
   - **true** → **IF** — `status == 'active'` (only an active source can be paused; `error`/`paused`/`removed` are not valid start states)?
     - **false** → **Set** (`message` = `"Источник нельзя поставить на паузу (текущий статус: {{status}})."`).
     - **true** → **Postgres — Update**: `UPDATE sources SET status = 'paused', updated_at = now() WHERE id = $1` → **Set** (`message` = `"Источник {{channel_username}} поставлен на паузу."`).
4. **NoOp** (join) → return `{ message }`.

## Output

```json
{ "message": "Источник example_channel поставлен на паузу." }
```

## Error handling

DB errors propagate to `error_handler`. Not-found and invalid-state-transition are normal branches with clear user-facing messages, not thrown errors.

## Retries

None needed — single idempotent UPDATE guarded by an explicit state check.

## Anti-duplicate / idempotency protection

The `status == 'active'` guard (step 3) prevents pausing an already-paused, errored, or removed source, so re-sending the same command twice can't silently do something unexpected — the second call falls into the "can't pause" branch with an explanatory message.

## n8n JSON

`n8n/workflows/pause_source.json` is **verified**: both branches confirmed live (active source correctly paused; re-pausing an already-paused source correctly rejected with a clear message). See `docs/decisions/005-n8n-postgres-node-quirks.md` for the general n8n node fixes this and every other workflow apply.
