# 001: Self-hosted RSSHub as the RSS source

Telegram channels have no native RSS feed. Options considered:

- **Self-hosted RSSHub** (chosen) — runs as a `docker-compose` service, its Telegram route scrapes the public `t.me/s/<channel>` web preview. No login, no MTProto, no phone/2FA — matches the project's hard constraint. You own uptime and rate limiting.
- **Third-party public RSSHub instance** (e.g. `rsshub.app`) — zero infra, but uptime/rate limits aren't guaranteed, public instances often throttle the Telegram route specifically due to abuse, and every added channel URL would be disclosed to a third party. Rejected given the project's own security posture.
- **A bridge that wraps MTProto server-side** — rejected outright; even server-side, that's still MTProto usage, which the spec explicitly forbids.

## Consequence: scrape fragility

RSSHub's Telegram route depends on scraping `t.me/s/` HTML — it can break if Telegram changes markup. Mitigated by `health_check` (`docs/workflows/health_check.md`) monitoring `sources.last_success_at`/`error_count` and alerting on a state change.

## Consequence: rate limiting

Polling many channels at once from one RSSHub instance risks that instance's own IP getting rate-limited by Telegram's web frontend. `poll_rss_sources` (`docs/workflows/poll_rss_sources.md`) deliberately processes sources one at a time with a small `Wait` between fetches, rather than firing all requests simultaneously.
