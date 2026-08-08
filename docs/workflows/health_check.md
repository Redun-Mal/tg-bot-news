# Workflow: health_check

## Purpose

Periodically confirm the pipeline's dependencies are actually reachable (Postgres, RSSHub, helper-api), log the result, and alert the user **only on a state change** — the moment something goes down, and the moment it recovers — rather than repeating the same alert every cycle while an outage is ongoing.

Claude API reachability is deliberately **not** checked with a dedicated ping here — a real check would mean spending a token-costing API call every 5 minutes purely to confirm the service is up, which is wasteful. Instead this workflow derives Claude's health from `workflow_logs`: a spike of recent `error`-level rows from `classify_with_claude` is a strong, free signal that something's wrong with the Claude integration specifically (bad key, rate limit, outage), without ever calling Claude itself.

## Trigger

**Schedule Trigger** — every 5 minutes.

## Input

None (self-triggered).

## Node sequence

1. **Schedule Trigger**.
2. **Postgres — Execute Query**: `SELECT 1`, `continueOnFail: true` (reachability is proven by whether this node errors, not by its result).
3. **Code**: `{ postgres: $input.first().json.error === undefined }`.
4. **HTTP Request** — `GET {{ $env.RSS_BASE_URL }}/healthz`, `continueOnFail: true`.
5. **Code**: merge in `{ rsshub: <same error-check> }`.
6. **HTTP Request** — `GET {{ $env.HELPER_API_URL }}/health`, `continueOnFail: true`.
7. **Code**: merge in `{ helper_api: <same error-check> }`.
8. **Postgres — Execute Query**: `SELECT count(*)::int AS recent_errors FROM workflow_logs WHERE workflow_name = 'classify_with_claude' AND level = 'error' AND created_at > now() - interval '30 minutes'`.
9. **Code** — build the final status object: `{ ...prev, claude_recent_errors, healthy }`, where `healthy = postgres && rsshub && helper_api && claude_recent_errors < 3`.
10. **Postgres — Execute Query**: `SELECT metadata FROM workflow_logs WHERE workflow_name = 'health_check' ORDER BY created_at DESC LIMIT 1`. **Must set `alwaysOutputData: true` on this node** — on the very first-ever run there's no prior row, so this returns 0 rows, and a Postgres node with 0 matching rows emits 0 output items by default, silently stopping every downstream node with no error at all. See `docs/decisions/005-n8n-postgres-node-quirks.md`.
11. **Code**: `stateChanged = prevHealthy !== undefined && prevHealthy !== healthy`.
12. **Postgres — Insert**: `INSERT INTO workflow_logs (workflow_name, level, message, metadata) VALUES ('health_check', $1, $2, jsonb_build_object('postgres', $3::boolean, 'rsshub', $4::boolean, 'helper_api', $5::boolean, 'claude_recent_errors', $6::int, 'healthy', $7::boolean)) RETURNING id`. Query Parameters (`options.queryReplacement`) must be **one single expression returning a real array** — `={{ [ level, message, postgres, rsshub, helper_api, claude_recent_errors, healthy ] }}` — not several comma-joined `={{ }}` blocks, which silently drops parameters past ~6. See `docs/decisions/005-n8n-postgres-node-quirks.md`.
13. **IF** — `stateChanged == true`?
    - **true, now unhealthy** → **Telegram — Send Message**: `"⚠️ Проблема с сервисом: {{failed components}}."`
    - **true, now healthy again** → **Telegram — Send Message**: `"✅ Всё снова работает."`
    - **false (no change)** → **NoOp**.
14. Workflow ends.

## Output

None (writes `workflow_logs`; sends a Telegram message only on a state transition).

## Error handling

Every check node uses `continueRegularOutput` on error specifically because a failing dependency is expected, normal input to this workflow, not an exceptional condition to crash on. If **this workflow itself** fails unexpectedly (e.g. Postgres is down so badly even the log-write in step 8 fails), it falls through to `error_handler` like anything else — there's no further fallback below that.

## Retries

None — a single missed HTTP check during a transient blip just gets caught on the next 5-minute cycle; retrying aggressively here would just delay detecting a real outage.

## Anti-duplicate protection

Not the `deliveries`-table kind (this workflow doesn't send news) — the relevant guarantee here is edge-triggered alerting (step 9): comparing against the previous check's stored state is what prevents re-alerting every 5 minutes for the same ongoing outage.

## n8n JSON

`n8n/workflows/health_check.json` is **verified**: imported into a real n8n instance (bootstrapped headlessly via its REST API), credentials wired up, executed end to end, and a real row confirmed in `workflow_logs` via `psql` — including the state-comparison logic working correctly on a first-ever run. Update the credential IDs to your own after importing (this export's IDs point at the dev instance's credentials, which won't exist in yours). Two real n8n Postgres-node bugs were found and fixed while getting this to actually work — see `docs/decisions/005-n8n-postgres-node-quirks.md` before building any of the other 11 workflows, all of which have the same failure modes waiting in their specs.
