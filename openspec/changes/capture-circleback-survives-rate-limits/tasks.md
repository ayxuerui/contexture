## 1. Runner

- [x] 1.1 `sweep.mjs`: space every `cb` call under the Free plan's 20 requests a minute; retry a call refused with
  `rate_limited` after waiting out the minute window; when retries run out in the transcript loop, keep what was
  written and list the rest under DEFERRED.
- [x] 1.2 `ctxr-capture-circleback.md`: the rate limit, and DEFERRED in the report.

## 2. Verification

- [x] 2.1 Integration test: a fake `cb` that rate-limits transcript reads. A short limit is retried and everything
  owed is retrieved; a limit that outlasts every retry keeps the first record and defers the rest, without
  `COLLECTION FAILED`; at a scaled-down clock, consecutive `cb` calls are spaced by the scaled interval.
- [x] 2.2 Run `npm run typecheck && npm test` and `openspec validate capture-circleback-survives-rate-limits --strict`,
  and confirm both exit 0.
