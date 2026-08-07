# 002: A small internal helper-api service, not inline n8n Code nodes

The spec asks for TypeScript strict mode + ESLint + Prettier + unit tests for normalization, dedup, classification-response validation, and user-ID gating — but also says TS should exist "only if truly needed," since n8n is the orchestrator.

Two options:

- **Pure n8n Code nodes** — logic lives as inline JS inside workflow JSON, never compiled/linted/unit-tested as a real package; any "tests" would just be documentation, disconnected from what's actually deployed.
- **A small internal `helper-api` TS service** (chosen) — Fastify + strict TypeScript + zod, reachable only on the internal Docker network (`expose`, not `ports`, in `docker-compose.yml`), called from n8n via HTTP Request nodes. This is the only way to get `tsc --noEmit`/`eslint`/`vitest` coverage that's actually exercised at runtime rather than decorative.

Kept deliberately small — six endpoints total (`/health`, `/normalize`, `/filter-check`, `/validate-classification`, `/format-digest`, `/validate-interest`), each backing one specific piece of logic named in the spec. No queueing system, no database access of its own (Postgres access stays in n8n's Postgres nodes) — this is a pure logic/validation layer, not a second application.

## Consequence: one more container

Trades "one more moving part" for genuine testability and separation of concerns. Given the spec explicitly lists unit-test requirements by name (normalization, dedup, classification, user-ID gating, error handling), the testability side won.
