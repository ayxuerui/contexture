## 1. Skills and templates

- [x] 1.1 Rewrite `templates/skills/ctxr-submit.md`: keep the 8-step spine, add a `ctxr doctor` (store scope) step before staging, change the fire-gate step to `git push -u origin <branch>` + `gh pr create --base <default> --title … --body …`, change the rename step to `git branch -m <name>` before pushing, keep verify-before-retry as `git ls-remote origin <branch>` + `gh pr list --head <branch>`.
- [x] 1.2 Rewrite `templates/skills/ctxr-land.md`: keep target-naming discipline (`--branch`/`--pr`, never inferred from the current checkout); add `gh pr view <n> --json number,url,title,state,mergeable,headRefName` as the first step; refuse a default-branch head; stop on `CONFLICTING` and route to the lifecycle skill's conflict playbook; re-read once on `UNKNOWN` before stopping; gate an explicit confirmation before `gh pr merge <n> --<method>`; re-read state after merging to confirm the forge reports merged; synchronize with `git -C <clone> fetch origin && git -C <clone> merge --ff-only origin/<default>` run from outside the session worktree, reporting rather than forcing a clone that can't fast-forward. Remove the "never merge by hand" ban per design D6.
- [x] 1.3 Rewrite `templates/skills/ctxr-session-lifecycle.md`'s reclaiming section to cover both cases in one unconditional block: scope with `ctxr session list --json`; for a merged, clean session run `git worktree remove <path>` and `git branch -d <branch>` (unforced — git refuses on its own if that isn't true); to discard unmerged work, `git worktree remove --force <path>` and `git branch -D <branch>`, behind the same explicit-go gate, stating plainly that this destroys uncommitted work.
- [x] 1.4 Collapse `reclaimingStep` in `src/core/skills.ts` (currently branching on `session.workspaces_external`) to render the single block from 1.3 unconditionally; update the `SUBMIT`/`LAND` skill descriptions.
- [x] 1.5 Update the other templates naming a removed command: `templates/skills/ctxr-organize-audit.md`, `templates/agents/canonical.md`, `templates/conventions/baseline-convention.md`, and `templates/hooks/pre-push.sh`'s refusal message (currently points at `ctxr session submit`; point at the skill/`git push` instead).
- [x] 1.6 Run `npx vitest run test/unit/skills.test.ts test/unit/agents-doc.test.ts test/integration/cli-name.test.ts` and confirm it passes.

## 2. Remove the commands

- [x] 2.1 Delete `src/commands/session-submit.ts`, `session-land.ts`, `session-abandon.ts`, `session-reap.ts`.
- [x] 2.2 Remove their registration from `src/run.ts` (imports and `.command(...)` blocks for `submit`, `land`, `abandon`, `reap`).
- [x] 2.3 Delete the error classes exclusive to the removed commands from `src/core/errors.ts`: the submit/land errors, `SessionNotFoundError`, `SessionReapWorkspacesExternalError`.
- [x] 2.4 Delete the now-callerless helpers: `renameCurrentBranch`, `pushBranch`, `isWorkingTreeClean` in `src/core/git/repo.ts`; `mainWorktreePath`, `removeWorktree`, `deleteBranch`, `pruneWorktrees` in `src/core/git/worktree.ts`. Confirm `listWorktrees`, `isSessionBranch`, `isSessionWorktreePath` still have a caller (`session list`) and are kept.
- [x] 2.5 Run `npm run typecheck` and confirm it passes.

## 3. Remove the forge adapter kind

- [x] 3.1 Delete `src/adapters/forge/` (types and the GitHub `gh` wrapper).
- [x] 3.2 Drop `forge` from `AdapterKind` and `SUPPORTED_ADAPTER_INTERFACE_VERSION` in `src/adapters/types.ts`; remove the forge export from `src/adapter.ts`; remove the forge registration from `src/adapters/builtin/index.ts`.
- [x] 3.3 Remove the default GitHub forge registration from `DEFAULT_ADAPTERS` in `src/config/defaults.ts`.
- [x] 3.4 Add the lenient parse to `AdapterDeclarationSchema`/`AdapterKindSchema` in `src/config/schema.ts` per design D2: accept and drop a `kind: forge` entry rather than rejecting it, so an unmigrated store still loads.
- [x] 3.5 Run `npm run typecheck` and confirm it passes.

## 4. Remove `session.workspaces_external`

- [x] 4.1 Drop `workspaces_external` from `SessionSchema` in `src/config/schema.ts`, keeping a lenient parse per design D2 so an unmigrated store's `session.workspaces_external` key is accepted and dropped rather than rejected.
- [x] 4.2 Remove the `workspaces_external` default from `src/commands/init.ts`.
- [x] 4.3 Run `npm run typecheck` and confirm it passes.

## 5. Migration

- [x] 5.1 Add `src/core/migrations/drop-forge-and-workspaces-external.ts`: strips `kind: forge` entries from `adapters` and the `session.workspaces_external` key from `contexture.yaml`, following the plan/apply pattern in `rename-conventions-path.ts`.
- [x] 5.2 Register the migration in `src/core/migrations/registry.ts`; bump `SUPPORTED_SCHEMA_VERSION` from 4 to 5 in `src/config/schema.ts`.
- [x] 5.3 Add a migration test (unit or integration) covering both deltas, following the pattern of the existing `0004` migration test.
- [x] 5.4 Run `node dist/bin.js migrate --dry-run --root <a fixture store pinned at schema_version 4 with a forge adapter and workspaces_external set>` and confirm the dry-run output names both deltas.

## 6. Tests

- [x] 6.1 Delete `test/unit/session-land.test.ts` and `test/unit/forge-adapter.test.ts`.
- [x] 6.2 Trim the submit, abandon, and reap cases from `test/integration/session-lifecycle.test.ts`, and the forge-degradation case from `test/integration/adapters-and-entry-doc.test.ts`.
- [x] 6.3 Delete the external-workspace-ownership case(s) from `test/unit/skills.test.ts`; add a case asserting the rendered lifecycle skill's Start and reclaiming sections are mutually consistent (no more conditional branch to diverge).
- [x] 6.4 Re-point the stale-adapter-version fixture in `test/unit/adapters-registry.test.ts` at the remaining (`harness-generation`) adapter kind instead of `forge`.
- [x] 6.5 Strip `workspaces_external: false` from every unit-test config fixture that carries it (mechanical; not a judgment call — flag any fixture where it isn't a no-op removal).
- [x] 6.6 Run `bash scripts/verify-phase0.sh` (build + typecheck + full vitest suite + a real `init`/`doctor` against a temp root) and confirm it passes end to end.

## 7. Manual verification

- [x] 7.1 Run `ctxr init` in a scratch store and confirm the rendered `ctxr-submit/SKILL.md`, `ctxr-land/SKILL.md`, and `ctxr-session-lifecycle/SKILL.md` name no removed command (`session submit`, `session land`, `session abandon`, `session reap`).
- [x] 7.2 Run `ctxr session --help` against the same scratch store and confirm it lists exactly `start`, `list`, `capture`.

## 8. Archive follow-up

- [x] 8.1 At archive time, edit `openspec/specs/adapters/spec.md`'s Purpose line directly (deltas cannot touch an existing capability's Purpose): drop "and forge (PR-hosting) integration" and the now-inapplicable "A third kind... is out of scope here" sentence, since only one adapter kind remains after this change archives. Verify with `git diff openspec/specs/adapters/spec.md` showing only that line changed.
