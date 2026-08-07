# 003: Spec-first n8n workflows, JSON only for the genuinely simple ones

No live n8n instance was available while this project was built — hand-authoring workflow JSON blind (node graph, IDs, node-type versions, credential references, expression syntax) without a canvas to validate against is a real risk: subtly wrong JSON either fails to import or imports and misbehaves silently.

## Approach

1. **Spec-first for all 12 workflows** — a detailed Markdown file per workflow in `docs/workflows/` (trigger, node-by-node sequence with node types/parameters/expressions, inputs/outputs, error handling, retries, anti-duplicate-send protection). These are the source of truth; JSON is a secondary, optional artifact.
2. **JSON attempted only where the workflow turned out to be close to linear** — `health_check` (`n8n/workflows/health_check.json`). `poll_rss_sources` was originally also expected to be simple, but once fully spec'd it turned out to have nested loops (sources → feed items) plus branching error handling — that's the "complex branching" case this strategy says to keep spec-only, so its JSON was deliberately not attempted. Don't assume a workflow is simple until its spec is actually written out in full.
3. **Any JSON that does exist is an unverified draft** — marked as such in both its own spec file and (for `health_check.json`) a Sticky Note node inside the JSON itself. Import it, review every node's parameters, and test-execute before trusting it.

## Consequence: pin the n8n image version

`docker-compose.yml` pins `n8nio/n8n:1.60.1`, not `latest` — node-type versions (`typeVersion` in workflow JSON) aren't guaranteed stable across n8n releases, so a floating tag would make even a _correctly_ imported workflow's future behavior unpredictable. Upgrade deliberately, and re-check imported workflows for regressions after doing so (see `README.md`, section 15).

## Consequence: n8n's native retry has no exponential backoff

Every workflow spec that mentions retries (`poll_rss_sources`, `classify_with_claude`, `send_instant_alerts`, `daily_digest`) uses n8n's built-in per-node `retryOnFail`/`maxTries`, which retries at a **fixed interval**, not exponentially. True exponential backoff would need a manual Wait-node loop computing increasing delays — not built for the MVP; each node's own retry count (2-3 tries) plus the outer scheduled-workflow interval (e.g. `poll_rss_sources` re-running every 10 minutes regardless) acts as the practical outer retry loop for anything that fails all its immediate tries.
