# n8n credential setup

Two secrets are used by workflows but are **not** passed as container environment variables: `TELEGRAM_BOT_TOKEN` and `CLAUDE_API_KEY`. They live only in n8n's own encrypted credential store (`n8n_data` volume, encrypted with `N8N_ENCRYPTION_KEY`), configured once via the n8n UI — never inlined into workflow JSON, which is the whole point of using n8n's credential system instead of a plain `$env` reference for these two.

Everything else the workflows read via `$env.*` (see `docs/workflows/*.md`) — `RSS_BASE_URL`, `HELPER_API_URL`, `TELEGRAM_ALLOWED_USER_ID`, `CLAUDE_MODEL`, `TZ` — **is** passed straight through as container environment variables (see `docker-compose.yml`'s `n8n` service), since none of it is a secret.

## 1. Telegram Bot credential

1. Open n8n at `http://localhost:${N8N_PORT}` (default `5679` — see `.env`).
2. **Credentials → New → Telegram API**.
3. Paste the bot token from BotFather (`TELEGRAM_BOT_TOKEN` in your `.env` — same value, just also entered here since n8n's Telegram nodes read from this credential, not from the container env).
4. Name it something identifiable, e.g. `Telegram Bot`.
5. Every **Telegram Trigger** / **Telegram — Send Message** node across the workflows (`telegram_commands`, `send_instant_alerts`, `daily_digest`, `error_handler`, `health_check`) needs this credential selected.

## 2. Claude (Anthropic) credential

n8n doesn't ship a dedicated "Anthropic" credential type in all versions — if yours doesn't have one, use a generic **HTTP Header Auth** credential instead:

1. **Credentials → New → HTTP Header Auth** (or **Anthropic**, if available in your n8n version).
2. Header name: `x-api-key`. Value: your Claude API key (`CLAUDE_API_KEY` in `.env`).
3. Also add a second header, `anthropic-version`, with a current API version string (check Anthropic's docs for the current value at setup time).
4. Every **HTTP Request** node calling `https://api.anthropic.com/v1/messages` (`classify_with_claude`, and `telegram_commands`' NL-intent step) needs this credential.

## 3. Postgres credential

1. **Credentials → New → Postgres**.
2. Host: `postgres` (the Docker Compose service name, not `localhost` — n8n reaches it over the internal `tg-news-net` network, not the host loopback mapping used by `npm run db:migrate`).
3. Database: `${POSTGRES_DB}` (default `tg_news` — the **application** database, not the separate `n8n` database n8n uses for itself).
4. User/password: `${POSTGRES_USER}` / `${POSTGRES_PASSWORD}` from `.env`.
5. Every **Postgres** node across every workflow needs this credential.

## If `$env` access is restricted

Some n8n versions/configurations block `process.env` access from expressions or Code nodes for security (`N8N_BLOCK_ENV_ACCESS_IN_NODE`). If `{{ $env.RSS_BASE_URL }}`-style expressions come back empty, add the same values as n8n **Variables** instead (**Settings → Variables**, Community edition supports read-only variables set via the UI) and swap `$env.X` for `$vars.X` in the affected nodes.
