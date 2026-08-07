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
2. **Postgres — Execute Query**: `SELECT 1` (Postgres reachability is proven by this node simply not failing — no branching needed here, its own success/failure *is* the signal, handled at step 6).
3. **HTTP Request** — `GET {{RSS_BASE_URL}}/healthz`, `onError: continueRegularOutput` (don't abort the workflow — a downed dependency is exactly the case this workflow exists to detect and report, not crash on).
4. **HTTP Request** — `GET {{HELPER_API_URL}}/health`, same `onError` setting.
5. **Postgres — Execute Query**: `SELECT count(*) FROM workflow_logs WHERE workflow_name = 'classify_with_claude' AND level = 'error' AND created_at > now() - interval '30 minutes'`.
6. **Merge** (combine the four branches above into one item) → **Code** — build a status object:
   ```json
   {
     "postgres": true,
     "rsshub": true,
     "helper_api": true,
     "claude_recent_errors": 0,
     "healthy": true
   }
   ```
   (`healthy` is `false` if any of `postgres`/`rsshub`/`helper_api` failed, or `claude_recent_errors` is above a small threshold, e.g. `>= 3`.)
7. **Postgres — Execute Query**: fetch the most recent `workflow_logs` row where `workflow_name = 'health_check'`, to compare against — this is what makes alerting edge-triggered instead of level-triggered.
8. **Postgres — Insert** into `workflow_logs`: `level = healthy ? 'info' : 'warn'`, `message`, `metadata = <status object from step 6>`.
9. **IF** — state changed since the previous check (`healthy` now vs. the previous row's `healthy` in its `metadata`)?
   - **true, now unhealthy** → **Telegram — Send Message**: `"⚠️ Проблема с сервисом: {{failed components}}."`
   - **true, now healthy again** → **Telegram — Send Message**: `"✅ Всё снова работает."`
   - **false (no change)** → do nothing.
10. Workflow ends.

## Output

None (writes `workflow_logs`; sends a Telegram message only on a state transition).

## Error handling

Every check node uses `continueRegularOutput` on error specifically because a failing dependency is expected, normal input to this workflow, not an exceptional condition to crash on. If **this workflow itself** fails unexpectedly (e.g. Postgres is down so badly even the log-write in step 8 fails), it falls through to `error_handler` like anything else — there's no further fallback below that.

## Retries

None — a single missed HTTP check during a transient blip just gets caught on the next 5-minute cycle; retrying aggressively here would just delay detecting a real outage.

## Anti-duplicate protection

Not the `deliveries`-table kind (this workflow doesn't send news) — the relevant guarantee here is edge-triggered alerting (step 9): comparing against the previous check's stored state is what prevents re-alerting every 5 minutes for the same ongoing outage.

## n8n JSON

A best-effort draft lives at `n8n/workflows/health_check.json` — this workflow is close to linear (no nested loops, unlike `poll_rss_sources`), so it was judged worth attempting per the plan's Decision C. It is **unverified** — hand-authored without a live n8n instance to import against. Treat it as a starting point to import and fix up, not a working artifact.
