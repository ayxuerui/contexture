## 1. Fix the stale sentence

- [x] 1.1 Update `templates/conventions/baseline-convention.md`'s "Git and sessions" section to describe the corrected write-gate hook path behavior instead of the pre-stabilize-write-gate-hook-path claim.
- [x] 1.2 Confirm no test pins the old sentence's literal text (searched `test/` for the old wording — none found).

## 2. Verification

- [x] 2.1 `npm run typecheck && npm run build && npm test`
