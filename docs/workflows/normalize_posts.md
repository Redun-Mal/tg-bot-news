# Workflow: normalize_posts

## Status: folded into `poll_rss_sources`

The original 12-workflow list (see the approved plan) had normalization as its
own workflow, presumably running after ingestion to fill in `posts.normalized_text`
/ `posts.content_hash` for rows that don't have them yet.

Once `poll_rss_sources` was fully spec'd (Stage E), it became clear that
splitting this out doesn't pull its weight for an MVP: every post already gets
a `POST /normalize` call to helper-api *before* it's inserted (see
`poll_rss_sources.md`, steps 9–10), so `normalized_text`/`content_hash` are
always populated at insert time. A separate scheduled workflow scanning for
`normalized_text IS NULL` rows would have nothing to do — it'd be dead code
kept "just in case," which the project's own guidance says to avoid.

No workflow file exists for this. If a future need arises for re-normalizing
existing rows (e.g. after changing the normalization algorithm), that's a
one-off backfill script, not a recurring workflow — different problem.

See `poll_rss_sources.md` for where normalization actually happens.
