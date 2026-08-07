# Troubleshooting

## Containers won't start / port conflicts

`docker compose up -d` fails with `port is already allocated` — most likely `5432` (Postgres) or the n8n port. Check what's already using it:

```bash
lsof -iTCP:5432 -sTCP:LISTEN -P
```

If it's an unrelated project (this happened during development — an existing n8n instance from a different repo was already on `5678`), change the conflicting port in `.env` (`N8N_PORT`, `POSTGRES_PORT`) rather than stopping the other project's containers.

## A container is "Up" but shows `unhealthy`

Check what its healthcheck is actually running and try it manually inside the container:

```bash
docker compose exec <service> sh
# then, e.g.: curl -sf http://127.0.0.1:1200/healthz
```

Two real issues hit during development, worth checking first:

- **`localhost` resolves to `::1` (IPv6) inside the container, but the app only binds IPv4** — healthchecks in this repo use `127.0.0.1` explicitly for exactly this reason. If you add a new healthcheck, do the same.
- **Wrong binary** — not every base image has both `curl` and `wget`. Check with `which curl wget` inside the container before assuming the app itself is broken.

## `npm run db:migrate` can't connect

It connects via `DATABASE_URL_HOST` (`127.0.0.1`, using the loopback port mapping), not `DATABASE_URL` (the Docker-network hostname `postgres`, used by containers). Make sure `docker compose up -d postgres` is running first, and that `POSTGRES_PORT` in `.env` matches the port actually published (check `docker compose ps`).

## Frequent RSS errors

- **A channel shows `status = 'error'` right after `/add_source`** — RSSHub couldn't reach `t.me/s/<channel>` at add-time. Common causes: the channel is actually private (not supported — public channels only), the username was mistyped, or RSSHub itself isn't fully started yet (check `docker compose logs rsshub`). The source is still saved (per spec — never silently drop a user's add request), and `poll_rss_sources` will keep retrying it every cycle; it flips back to `active` automatically on the first successful fetch (see `docs/workflows/poll_rss_sources.md`).
- **A previously-working channel flips to `error` after running fine for a while** — check `workflow_logs` (`workflow_name = 'poll_rss_sources'`) for the actual HTTP error. Telegram occasionally changes the `t.me/s/` page markup, which can break RSSHub's scraper until RSSHub itself is updated (`docker compose pull rsshub && docker compose up -d rsshub`) — see `docs/decisions/001-rss-bridge.md`.
- **Feed fetches succeed but no new posts appear** — likely everything in the feed already exists in `posts` (the `ON CONFLICT DO NOTHING` guard is working as intended, not a bug). Confirm via `SELECT count(*) FROM posts WHERE source_id = <id>`.
- **RSSHub itself returns 429 / rate-limited** — you're polling too many channels too fast for RSSHub's own request rate against Telegram's frontend. `poll_rss_sources` already staggers requests with a small `Wait` between sources; if it's still happening, increase that delay.

## Key rotation

| Secret               | How to rotate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | In BotFather: `/mybots` → select bot → **API Token** → **Revoke current token**. Update the value in `.env` (documentation only) **and** in n8n's Telegram credential (`n8n/credential-setup.md`) — n8n reads from its own credential store, not the container env, so both need updating.                                                                                                                                                                                                                                                                       |
| `CLAUDE_API_KEY`     | Create a new key in the Anthropic Console, update it in n8n's Claude/HTTP-Header-Auth credential, then revoke the old key in the Console once you've confirmed the new one works (`classify_with_claude` running successfully).                                                                                                                                                                                                                                                                                                                                  |
| `POSTGRES_PASSWORD`  | Update in `.env`, then: `docker compose exec postgres psql -U tg_news -c "ALTER USER tg_news WITH PASSWORD 'new-password'"`, then `docker compose up -d` to restart dependent services with the new value.                                                                                                                                                                                                                                                                                                                                                       |
| `N8N_ENCRYPTION_KEY` | **Do not rotate casually** — this key encrypts everything in n8n's credential store. Changing it without n8n's own credential-migration process makes every existing credential (Telegram token, Claude key, Postgres password — all of them, as stored _inside n8n_) unreadable, effectively locking you out until you re-enter every credential from scratch. If you must rotate it, back up the `n8n_data` volume and `n8n` database first (`docs/backup.md`), then follow n8n's own documented encryption-key-rotation procedure — not just an env var swap. |

## `helper-api` container fails to build

`services/helper-api/Dockerfile` expects the **repo root** as its build context (`docker-compose.yml`'s `helper-api.build.context: .`), because `services/helper-api/tsconfig.json` extends the root `tsconfig.base.json`. If you're building it manually rather than via `docker compose build helper-api`, make sure you're pointing Docker at the repo root, not `services/helper-api/`.
