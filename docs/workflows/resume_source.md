# Workflow: resume_source

## Purpose

Handle `/resume_source <id>` — undo `pause_source`, putting a source back into the `poll_rss_sources` rotation. Also usable to retry a source that ended up in `error` status, since `resume_source` doesn't re-check reachability itself — the next poll cycle will.

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
   - **true** → **IF** — `status IN ('paused', 'error')` (only these two states can be resumed; `active` is already running, `removed` must go through `/add_source` again)?
     - **false** → **Set** (`message` = `"Источник нельзя возобновить (текущий статус: {{status}})."`).
     - **true** → **Postgres — Update**: `UPDATE sources SET status = 'active', error_count = 0, updated_at = now() WHERE id = $1` → **Set** (`message` = `"Источник {{channel_username}} снова активен."`).
4. **NoOp** (join) → return `{ message }`.

## Output

```json
{ "message": "Источник example_channel снова активен." }
```

## Error handling

DB errors propagate to `error_handler`. Not-found and invalid-state-transition are normal branches, not thrown errors.

## Retries

None needed — single idempotent UPDATE guarded by an explicit state check.

## Anti-duplicate / idempotency protection

The `status IN ('paused', 'error')` guard prevents resuming an already-active or removed source. Resetting `error_count = 0` on resume gives an `error`-status source a clean slate rather than immediately re-tripping whatever `error_count` threshold `poll_rss_sources` uses to flag it again.
