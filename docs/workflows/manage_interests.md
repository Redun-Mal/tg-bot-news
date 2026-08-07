# Workflow: manage_interests

## Purpose

Handle `/set_interest <topic>` and `/remove_interest <topic>`, backing `user_interests` — the table `classify_with_claude` reads to weigh relevance against what the user actually cares about.

## Trigger

**Execute Workflow Trigger**, called by `telegram_commands`.

## Input

```json
{ "telegramUserId": 123456789, "action": "add", "topic": "Rust" }
```

`action` is `"add"` (from `/set_interest`) or `"remove"` (from `/remove_interest`).

## Node sequence

1. **Execute Workflow Trigger**.
2. **IF** — `action == "add"`?
   - **true**:
     a. **HTTP Request** — `POST {{HELPER_API_URL}}/validate-interest` with `{ interest: topic }` (Stage D/I's format validation: trim, collapse whitespace, 60-char cap).
     b. **IF** — invalid? → **Set** (`message` = the returned `error`) → jump to step 4.
     c. **Postgres — Execute Query** — case-insensitive existing check (a user typing `typescript` shouldn't create a second entry next to an existing `TypeScript`): `SELECT id FROM user_interests WHERE telegram_user_id = $1 AND lower(interest) = lower($2)`.
     d. **IF** — found? → **Set** (`message` = `"«{{topic}}» уже в списке интересов."`) → jump to step 4.
     e. **Postgres — Insert**: `INSERT INTO user_interests (telegram_user_id, interest) VALUES ($1, $2) ON CONFLICT (telegram_user_id, interest) DO NOTHING RETURNING id` (the validated, whitespace-normalized `interest` from step 2a) → **Set** (`message` = `"Добавлено: {{interest}}"`).
   - **false** (`action == "remove"`):
     a. **Postgres — Delete**: `DELETE FROM user_interests WHERE telegram_user_id = $1 AND lower(interest) = lower($2) RETURNING id` (case-insensitive match, no separate format validation needed for a removal).
     b. **IF** — row returned? → **Set** (`message` = `"Удалено: {{topic}}"`) : **Set** (`message` = `"«{{topic}}» не найдено в списке интересов."`).
3. **NoOp** (join) → return `{ message }`.

## Output

```json
{ "message": "Добавлено: Rust" }
```

## Error handling

DB/helper-api errors propagate to `error_handler`. Duplicate-add and not-found-remove are normal branches with clear messages, not thrown errors.

## Retries

None needed — single validated INSERT/DELETE per call.

## Anti-duplicate protection

`user_interests.UNIQUE(telegram_user_id, interest)` (Stage B) is the backstop behind the explicit case-insensitive pre-check (step 2c) — the pre-check gives a clean user-facing "already in list" message; the constraint plus `ON CONFLICT DO NOTHING` guards the exact-case race a case-insensitive `SELECT` could still miss between check and insert.
