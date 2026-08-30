## 1. Forge interface v2

- [ ] 1.1 Add `pullRequest` and `mergePullRequest` to `ForgeAdapter`, bump `interfaceVersion` to 2, implement both in the GitHub adapter via `gh`; `adapters.compatibility` reports a v1 forge adapter
- [ ] 1.2 Tests with a fake forge: state mapping (open/merged/closed; mergeable/conflicting/unknown), merge method flag; compatibility finding for a stale adapter; `npx vitest run test/unit/forge-adapter.test.ts test/unit/adapter-checks.test.ts`

## 2. Commands (write-lifecycle)

- [ ] 2.1 `session submit --branch <name>` renames the session branch before pushing; `session land [--pr|--branch] [--yes] [--merge-method] [--reap]` per D1–D3, refusing on the default branch and on a head-branch mismatch
- [ ] 2.2 Tests: each state arm; gate declined → nothing merged; `--no-input` without `--yes` → distinct error; retry after a simulated failure between merge and sync performs only sync; root checkout off the default branch → reported, not touched; `--reap` removes only a clean, merged, contexture-created worktree; `npx vitest run test/unit/session-land.test.ts test/unit/session-submit.test.ts`

## 3. Skills

- [ ] 3.1 Add `ctxr-submit` and `ctxr-land`; narrow `ctxr-session-lifecycle` to start, re-scan, conflict playbook, sequencing, referencing both
- [ ] 3.2 Tests: submit skill runs the capture pass once and ends in `ctxr session submit`; land skill ends in `ctxr session land` and never instructs a manual merge; lifecycle skill contains neither verb's steps; eleven owned skills written by init, delivered by update; `npx vitest run test/unit/procedures.test.ts test/integration/owned-skills.test.ts`

## 4. Contract

- [ ] 4.1 `openspec/specs/cli-contract` updated for `session land` and `--branch`; `npm run build && npm run typecheck && npx vitest run` green; in a temp store with a fake forge, `ctxr session land --yes --json` on a mergeable session reports `merged`, `synced`, and the reap hint
