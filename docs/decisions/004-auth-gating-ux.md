# 004: Silent-ignore for unauthorized senders

When someone other than `TELEGRAM_ALLOWED_USER_ID` messages the bot, two options were considered:

- **Silent ignore + log** (chosen) — no reply sent, event optionally logged at `debug` level to `workflow_logs`. Doesn't confirm to a stranger that the bot exists or is listening.
- **Reply with an access-denied message** — explicitly tells the non-owner they're not authorized, which also confirms the bot is live and responsive to anyone who finds/guesses its username.

The auth check is the very first thing `telegram_commands` does after its trigger (`docs/workflows/telegram_commands.md`, step 2-3) — nothing downstream (command parsing, DB queries, Claude calls) ever runs for an unauthorized sender, both for the privacy reason above and to avoid spending any resources on messages that will never be acted on.
