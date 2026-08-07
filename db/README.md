# Database

Schema for the application data (not n8n's own internal tables — those live in a
separate `n8n` database created by `db/init/001-create-n8n-db.sh`, see `docker-compose.yml`).

## Migrations

Managed by [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate), plain JS files in `db/migrations/`, applied in filename (timestamp) order.

```bash
docker compose up -d postgres   # needs the loopback port mapping from docker-compose.yml
npm run db:migrate              # up
npm run db:migrate:down         # down one step
```

Both scripts source `.env` and connect via `DATABASE_URL_HOST` (`127.0.0.1`), since migrations run from the host, not from inside the Docker network.

## Seed

```bash
npm run db:seed
```

Idempotently inserts the default `user_interests` rows for `TELEGRAM_ALLOWED_USER_ID`. Safe to re-run.

## Tables

`sources`, `posts`, `news_items`, `news_sources` (join), `deliveries`, `user_interests`, `bot_settings`, `workflow_logs` — see the migration files for exact columns/constraints. Key invariants:

- `deliveries` has `UNIQUE(news_item_id, telegram_user_id, delivery_type)` — the anti-duplicate-send guard. Every send path must `INSERT ... ON CONFLICT DO NOTHING RETURNING id` before calling Telegram.
- `news_sources` has `UNIQUE(post_id)` — a post belongs to at most one `news_item`.
- `posts.content_hash` is intentionally **not** unique — identical hashes from different sources are the multi-source merge case.
