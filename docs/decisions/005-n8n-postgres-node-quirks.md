# 005: Real n8n node quirks found by actually running workflows

`docs/decisions/003-n8n-workflow-strategy.md` explained why workflow JSON was spec-first and unverified for most of this project — no live n8n instance was available. Once a real Telegram bot token made it worth standing up n8n via its REST API (headless, no browser — owner-account bootstrap + session cookie + `/rest/workflows`), `health_check` became the first workflow actually built and executed for real. Two non-obvious bugs surfaced that silently produce wrong behavior with **no error at all**, which no amount of spec review would have caught. Apply both rules to every other workflow before assuming it works.

## Quirk 1: a node fed zero input items simply doesn't run — no error, no output

`health_check`'s "Previous check result" query (`SELECT ... LIMIT 1`) returns 0 rows on the very first run (empty table). A Postgres node with 0 matching rows emits **0 output items**, not one item with null/empty data. Every downstream node — `Compare to previous`, `Insert workflow_logs row`, the `IF`, the Telegram send — then received 0 input items and **did not execute at all**. The overall execution still reported `status: "success"` and `finished: true`, because nothing actually errored; the workflow just quietly stopped partway through.

This silently breaks any workflow pattern that does "look up whether X already exists, then branch" when X might legitimately not exist yet — which is most of this project's dedup/anti-duplicate-send patterns (`deliveries` reservation checks, `deduplicate_posts`' similarity lookup, `news_sources` existence checks, etc.).

**Fix**: set `"alwaysOutputData": true` on any node whose query might return zero rows but whose output is still needed downstream (a sibling property to `continueOnFail`, at the node's top level, not inside `parameters`). Confirmed live: without it, the workflow silently truncated; with it, `Previous check result` emitted one item with `{}` and everything downstream ran correctly.

## Quirk 2: the Postgres node's "Query Parameters" field breaks past ~6 comma-joined expressions

The `executeQuery` operation's `options.queryReplacement` field is documented as "a comma-separated list of the values you want to use as query parameters," intended to be filled with multiple `={{ expr1 }},={{ expr2 }},...` blocks. Empirically, this reliably worked with 6 parameters built this way and silently dropped the 7th (`Variable $7 out of range. Parameters array length: 6` — the query itself referenced `$7`, but only 6 params ever got bound). A separate, earlier symptom of the same underlying fragility: a single parameter whose _resolved value_ itself contained commas (a `JSON.stringify()`'d object) produced `invalid input syntax for type json` / `"The input string ended unexpectedly"` — the value was getting truncated at an internal comma.

**Fix**: instead of comma-joining multiple `={{ }}` blocks, set `queryReplacement` to **one single expression that evaluates to a real JS array**:

```
={{ [ value1, value2, value3, value4, value5, value6, value7 ] }}
```

Confirmed live with 7 parameters (mixing strings, booleans, and a number) — every value bound correctly, `$1` through `$7`. This form appears to bypass whatever string-splitting logic breaks the comma-joined form, and it should generalize past 7 too (untested above 7, but the mechanism — n8n keeping a single-expression field's native return type instead of stringifying it — doesn't have an obvious reason to cap out).

Also: never pass a multi-key JSON blob as a single text parameter cast to `::jsonb`. Build it in SQL instead via `jsonb_build_object('key1', $1::type, 'key2', $2::type, ...)` from individual scalar parameters — sidesteps the comma-in-value problem entirely and is what `health_check`'s `Insert workflow_logs row` node actually does.

## Quirk 3: `IF` node `exists`/`notExists` operators enforce strict typing on the value itself

Found while building `add_source`. Two variants of the same underlying issue:

- Checking whether a `continueOnFail` HTTP node errored via `{ leftValue: "={{ $json.error }}", operator: { type: "string", operation: "notExists" } }` throws `Wrong type: ... is an object but was expecting a string` — a node's `error` field is a whole error object, not a string, and the `string`-typed operator validates against that regardless of the operation being an existence check.
- Comparing a genuinely numeric `id` field (from a Postgres `SELECT`) the same way, with a `string`/`notEmpty` operator, throws `Wrong type: '4' is a number but was expecting a string`.

**Fix**: don't use `exists`/`notExists`/`notEmpty` operators against fields of unpredictable or non-string type. Use a plain boolean expression instead: `{ leftValue: "={{ $json.error === undefined }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }`. This sidesteps type inference entirely — the expression itself resolves to a boolean before the condition ever runs.

## Consequence for the other workflow specs

Every remaining spec needs: the array-expression form for `queryReplacement` on any insert/update with more than a couple of dynamic values (`posts`, `news_items`, `sources`, `deliveries`, ...); `alwaysOutputData: true` on any "does X already exist?" lookup that might return zero rows when something downstream depends on getting an item regardless; and boolean-expression conditions (not `exists`/`notExists`/`notEmpty` operators) on any `IF` node checking a field whose type isn't guaranteed to be a plain string. None of these three are visible from reading the spec Markdown alone — all three were found only by executing a real workflow against real Postgres/HTTP responses and checking actual results, not by trusting an execution's reported "success" status.
