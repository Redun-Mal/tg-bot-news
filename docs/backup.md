# Backup and restore

Two things need backing up: the **application database** (`tg_news` — sources, posts, news_items, deliveries, interests, settings) and **n8n's own state** (`n8n` database plus the `n8n_data` volume, which holds encrypted credentials and workflow definitions).

## PostgreSQL — application data

### Backup

```bash
docker compose exec -T postgres pg_dump -U tg_news -d tg_news --format=custom > backup_$(date +%Y%m%d_%H%M%S).dump
```

`--format=custom` produces a compressed, `pg_restore`-only file — smaller and more flexible (selective table restore, parallel restore) than plain SQL.

### Restore

```bash
# Into an existing (empty) tg_news database:
docker compose exec -T postgres pg_restore -U tg_news -d tg_news --clean --if-exists < backup_20260101_090000.dump
```

`--clean --if-exists` drops existing objects before recreating them — safe to run against a database that already has the schema applied (e.g. after `npm run db:migrate`), but **do not** run this against a database you want to keep other data in; it's a full restore, not a merge.

### Scheduling

For a personal single-user MVP, a simple cron on the host running Docker is enough — no need for a dedicated backup service:

```
0 3 * * * cd /path/to/tg-bot-news && docker compose exec -T postgres pg_dump -U tg_news -d tg_news --format=custom > /path/to/backups/tg_news_$(date +\%Y\%m\%d).dump
```

Keep a rotation (e.g. last 14 daily dumps) — a plain `find /path/to/backups -mtime +14 -delete` in the same cron job is enough at this scale.

## PostgreSQL — n8n's own data

n8n's workflow definitions and (encrypted) credentials live in its own `n8n` database, plus some state in the `n8n_data` Docker volume. Back up the database the same way:

```bash
docker compose exec -T postgres pg_dump -U tg_news -d n8n --format=custom > n8n_backup_$(date +%Y%m%d).dump
```

And the volume (encrypted credentials specifically require `N8N_ENCRYPTION_KEY` to still match on restore — see `docs/troubleshooting.md`):

```bash
docker run --rm -v tg-bot-news_n8n_data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/n8n_data_$(date +%Y%m%d).tar.gz -C /data .
```

Restoring the volume is the reverse (`tar xzf` into a fresh volume) — only needed if you're restoring n8n itself, not the application data.

## What's _not_ backed up (and doesn't need to be)

`.env` — regenerate it from `.env.example` plus your own secrets; it's never meant to be a durable artifact, and definitely never belongs in a backup that might end up somewhere less protected than the original `.env` itself.
