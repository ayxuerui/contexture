## 1. Landing lock and identity

- [ ] 1.1 Add the landing lock to `src/commands/land.ts` (D4): `<git-common-dir>/ctxr-land.lock` with `O_EXCL`, pid and host, removed on every exit path, stale-pid takeover on the same host; `--pending` exits 0 with a notice naming the holder, `land <pr>` exits with the failed-check code and `land.busy`
- [ ] 1.2 Add the fallback committer identity (D6) for the rebase when `git var GIT_COMMITTER_IDENT` fails, in that process's environment only
- [ ] 1.3 Integration tests: two concurrent `ctxr land --pending` (one steps aside), a stale lock taken over, a rebase on a host with `GIT_CONFIG_GLOBAL=/dev/null` and no identity variables commits as the recording login and leaves `.git/config` unchanged
- [ ] 1.4 `npm test -- land` passes

## 2. The lander in serve

- [ ] 2.1 Add `change_approval.land: 'auto' | 'manual'` to the schema (optional, no shipped default) with config tests
- [ ] 2.2 Add the lander (`src/core/browse/lander.ts`): idle / running / running+pending (D3), spawning the CLI's own executable with `land --pending --root <root>` (D2), output prefixed `land: ` on stderr, a 300 s sweep plus one 10 s after start, stopped (child killed) on shutdown; unit tests with an injected spawner and clock for coalescing, the sweep and stop
- [ ] 2.3 Wire it into `serve`: started, kept or stopped as the serving state's `change_approval` and `land` change; triggered (not awaited) after an accepted Approve in `decide()`
- [ ] 2.4 Integration test: plain `ctxr serve` with `change_approval` and no `land` key — an Approve on the page merges the pull request and removes its worktree with no other lander; with `land: manual` nothing lands; a blocked run leaves routes answering
- [ ] 2.5 `npm test -- serve` passes

## 3. Docs and close-out

- [ ] 3.1 README: the approval section says `serve` lands by itself, names `land: manual` and the lock, and keeps `ctxr land` for manual use; drop the scheduler instructions
- [ ] 3.2 File the contexture-images follow-up: remove `land-cron` and the `approvals` profile, make `serve`'s store mount writable, keep the key out of `agents`
- [ ] 3.3 `npm run build && npm test && openspec validate serve-lands-approved-changes --strict` all exit 0
