# Workflow: error_handler

## Purpose

The catch-all for any unexpected failure in any other workflow: log it to `workflow_logs`, and notify the user. This is n8n's standard "Error Workflow" pattern — every other workflow in this project should have its **Settings → Error Workflow** set to point at this one, so any node failure that isn't already handled locally (e.g. `poll_rss_sources`'s per-source `continueRegularOutput` branches, which are *not* errors from n8n's point of view) ends up here automatically.

## Trigger

**Error Trigger** (`n8n-nodes-base.errorTrigger`) — n8n's dedicated node for this; it receives `{ execution, workflow, trigger }` automatically whenever a workflow configured to point here fails.

## Input

n8n's standard error-trigger payload: failed workflow name, failed node name, error message, execution ID/URL.

## Node sequence

1. **Error Trigger**.
2. **Code** — extract `{ workflowName, nodeName, errorMessage, executionUrl }` from the payload.
3. **Postgres — Insert** into `workflow_logs`: `workflow_name = <the failed workflow's name>`, `level = 'error'`, `message = errorMessage`, `metadata = { nodeName, executionUrl }`.
4. **Telegram — Send Message** to `TELEGRAM_ALLOWED_USER_ID`: `"⚠️ Ошибка в workflow «{{workflowName}}» (узел: {{nodeName}}): {{errorMessage}}"`. `retryOnFail: true`, `maxTries: 2` (best-effort notification, not core functionality — not worth the same 3-try policy as a data-critical call).

## Output

None (writes `workflow_logs`; sends a Telegram alert).

## Error handling

This is itself the error handler — it must not point back at itself as its own Error Workflow (that would risk an infinite loop if, say, the Postgres insert in step 3 fails because Postgres is down). If step 3 or step 4 fails, that failure is simply not caught by anything further; n8n's own execution log is the last resort. This is an accepted, deliberate dead end, not an oversight.

## Retries

Telegram send: 2 tries (see above — best-effort, not data-critical).

## Anti-duplicate protection

None — every invocation represents a genuinely distinct error event, and the user should hear about each one. A source that's been broken for days will trigger `error_handler` (well, more precisely, its own `poll_rss_sources`-level `continueRegularOutput` branch — see the note in step 1 above about what does vs. doesn't reach here) repeatedly; that's a known MVP tradeoff (accept some potential noise) rather than something this workflow tries to throttle. If it becomes a real problem in practice, the fix belongs in `health_check`'s edge-triggered pattern, not here.
