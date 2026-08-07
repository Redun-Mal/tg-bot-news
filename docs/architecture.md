# Architecture overview

## Pipeline

```
public Telegram channel (t.me/<channel>)
        │  scraped by
        ▼
   RSSHub (self-hosted, docker-compose)
        │  polled every 10 min
        ▼
   poll_rss_sources  ──▶  posts table (dedup: post_url / (source_id, external_id))
        │
        ▼
   deduplicate_posts  ──▶  content_hash + pg_trgm similarity vs. already-resolved posts
        │  (no match)
        ▼
   classify_with_claude  ──▶  helper-api /filter-check, Claude API (forced structured output),
        │                     helper-api /validate-classification, level-4 title/summary dedup
        ▼
   news_items + news_sources
        │
        ├──▶ send_instant_alerts  (importance ≥ 3 and relevance ≥ 0.75)
        └──▶ daily_digest         (everything else, 09:00 Asia/Bishkek, via helper-api /format-digest)
                │
                ▼
        deliveries table (UNIQUE(news_item_id, telegram_user_id, delivery_type) — the
                           anti-duplicate-send guarantee every send path relies on)
```

`telegram_commands` is the separate, always-on entry point for everything the user initiates directly (`/add_source`, `/news`, free-text queries, ...) — see `docs/workflows/telegram_commands.md`.

## Components

- **n8n** — orchestrates every workflow above. See `docs/workflows/` for one spec per workflow (trigger, node sequence, error handling, retries, anti-duplicate protection) and `n8n/credential-setup.md` for how secrets are wired in.
- **PostgreSQL** — single source of truth; also where the anti-duplicate-send and dedup guarantees actually live (as DB constraints, not application-level checks). Schema: `db/README.md`.
- **RSSHub** — the only ingestion mechanism; see `docs/decisions/001-rss-bridge.md` for why.
- **helper-api** — small internal TypeScript service backing the logic worth real unit tests (normalization, content hashing, pre-Claude filtering, classification-schema validation, digest formatting/message-splitting, interest-input validation, auth gating). See `docs/decisions/002-helper-api-microservice.md`.
- **Claude API** — classification/summarization (`classify_with_claude`) and free-text NL query intent routing (`telegram_commands`), both using forced structured output rather than prompt-only JSON instructions.

## Why things are split the way they are

See `docs/decisions/` for the reasoning behind the four decisions with real trade-offs (RSS bridge choice, helper-api vs. inline n8n Code nodes, spec-first vs. JSON n8n workflows, silent-ignore auth UX). Everything else follows fairly directly from the spec.
