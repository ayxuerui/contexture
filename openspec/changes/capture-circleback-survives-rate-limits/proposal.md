## Why

A manual run on 2026-11-12, after three missed weekly runs had left a backlog, read 13 transcripts back to back and
was refused on the 14th: `"reason":"rate_limited"`, `"retryable": true`, from Circleback's Free plan. The runner
aborted with `COLLECTION FAILED`. The 13 records it had already written sat in the review worktree, but the report
named none of them, nor the meetings still owed (#239). A backlog is exactly when the sweep matters most, since the
Free plan hides full notes after about 30 days.

## What Changes

- **Every `cb` call is spaced to the documented limit.** Circleback's API documentation limits a Free account to
  3 requests a second and 20 a minute (paid plans 20 and 300), counted across every API key and CLI token of the
  account. The runner cannot tell the plan, so it keeps to the Free plan's: 3.5 seconds between calls, retries
  included, about 17 a minute, leaving room for other use of the account.
- **A rate-limited `cb` call is retried** after 30, 60 and 60 seconds, so the one-minute window has refilled before
  the second retry. The API sends `Retry-After`, but `cb` passes on only `"retryable": true`, so the schedule is a
  fixed one.
- **When the limit outlasts every retry, the runner degrades instead of aborting.** It keeps the records already
  written, lists them under RETRIEVED, lists the owed meetings it did not read under a new DEFERRED section, reads
  nothing more that run, and prints the rest of its report. The next run retrieves the deferred meetings, because
  they are still absent from the store.
- **The skill text** says a DEFERRED list is a partial result to continue from, not a failure.

## Capabilities

### Modified Capabilities
- `harness-portability`: the Circleback skill's runner retries a rate limit and reports a partial retrieval.

## Impact

- `templates/skills/ctxr-capture-circleback/sweep.mjs`, `templates/skills/ctxr-capture-circleback.md`.
- `test/integration/circleback-sweep.test.ts`.
- This change modifies the requirement `capture-circleback-sees-local-worktrees` also modifies, and builds on that
  change's text; sync that change first.
