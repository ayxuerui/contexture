# Plan: Stop duplicate accounts that differ only by letter case or spaces in the email address

## Context
Postgres 15 behind a Django app. The `users` table has 40 million rows and takes up to 1,500 writes per second
at peak. Today `Ana@Example.com` and `ana@example.com ` can both sign up. We estimate about 12,000 existing
duplicate pairs.

## Steps
S1. Add a nullable column `email_normalized text` to `users`.
S2. Deploy app code that fills `email_normalized` with the lowercased, trimmed email on signup and on email change.
S3. Build a backfill framework: jobs defined in YAML, a scheduler, and a progress page, to use for this backfill and later ones.
S4. Backfill existing rows during business hours with `UPDATE users SET email_normalized = lower(trim(email))` as one statement.
S5. Create a unique index on `email_normalized` with `CREATE UNIQUE INDEX CONCURRENTLY`.
S6. Run a merge script over accounts that share a normalized email: keep the oldest account of each group and delete the others.
S7. In the same release, rename `users.username` to `users.handle` across the codebase.
S8. Verify the backfill: run `SELECT count(*) FROM users` and confirm it equals the count taken before S4.
S9. The work is done when the migration pull request is merged.

## Assumptions
- `lower(trim(email))` is the right notion of "same address" for our users.
- The oldest account of a duplicate group is the one the person uses.

## Reversibility
- Reversible: S1 to S5, S7
- Irreversible: S6

=====KEY=====
A1 | architect | S5 | The unique index is created (S5) before duplicates are merged (S6); with about 12,000 duplicate pairs present the index build fails. The merge must come first.
A2 | architect | S7 | Renaming users.username to users.handle is unrelated to the goal and does not belong in this change.
K1 | skeptic | S4 | One UPDATE over 40 million rows on a hot table during business hours: a single long transaction that holds row locks, bloats the table and WAL, lags replicas, and loses all progress if it fails. It should be batched and run off-peak.
K2 | skeptic | S6 | The merge deletes the newer accounts outright, with no backup or soft delete and without moving their data, on the unproven assumption that the oldest account is the one in use; the deletion cannot be undone.
P1 | pragmatist | S3 | A YAML-driven backfill framework with a scheduler and progress page is far more machinery than one backfill needs.
P2 | pragmatist | S1 | A unique index on the expression `lower(trim(email))` (or citext) reaches the goal with no new column, no app change and no backfill.
V1 | verifier | S8 | The total row count is the same whether or not the backfill filled anything; the check cannot fail. It should count rows where email_normalized is still null or wrong.
V2 | verifier | S9 | "Done when the pull request is merged" is not a checkable outcome: merged is not applied in production, and nothing shows that a duplicate signup is now refused.
