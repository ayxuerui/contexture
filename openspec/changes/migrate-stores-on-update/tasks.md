## 1. The migration ladder

- [x] 1.1 Add `src/config/migrations.ts`:
  - the `MigrationStep` type `{ from: number; retires: string[]; apply(doc: Document): void }`;
  - the ordered `MIGRATION_STEPS` array, empty at merge;
  - `migrationFloor()`, which is `min(from)` or `SUPPORTED_SCHEMA_VERSION` when the ladder is empty;
  - `runMigrations(doc, fromVersion)`, which applies every step from `fromVersion` up in order and sets `schema_version` to the supported version (design D1).
- [x] 1.2 Add `test/unit/config-migrations.test.ts` with the two enforcement tests (design D4):
  - contiguity, for every version from the floor up to the supported version;
  - no `retires` path is a declared key of `StoreConfigSchema`.

  Both pass against the empty ladder.
- [x] 1.3 In the same file, exercise the runner with a test-local two-step ladder (`from: 8` and `from: 9`) over a fixture carrying comments, blank lines and non-default key order. Assert:
  - the steps run in order;
  - the output differs from the input only in the renamed keys and `schema_version`;
  - a step that throws leaves the input document's serialization unchanged.
- [x] 1.4 `npx vitest run test/unit/config-migrations.test.ts` exits 0.

## 2. One gate, with the update exception

- [x] 2.1 Extend `SchemaVersionBehindError` (`src/core/errors.ts`) with the floor rather than adding a second class. The error code a caller matches on stays `config.schema_version.behind` either way, and the remedy rides in the message and in `details.remedy`: `update` within the floor, `by_hand` below it. Below the floor the message states that this release cannot bring the store forward. Add `SchemaMigrationFailedError` for a failed step or a migrated configuration that does not validate.
- [x] 2.2 Reword `SchemaVersionBehindError` to name `ctxr update` as the remedy. Older stores below the floor never reach it.
- [x] 2.3 In `src/config/load.ts`:
  - parse with `parseDocument`;
  - add a `{ migrate: true }` mode to `readConfig` that returns `{ config, document, migratedFrom }`;
  - in the default mode, refuse missing and newer versions as today, below-floor with the new error, and behind-version with the reworded one;
  - in migrate mode, run the ladder in memory, then validate the migrated value with `StoreConfigSchema`, naming a validation failure as such and writing nothing (design D2).
- [x] 2.4 Give `openStore` (`src/core/store.ts`) a matching option. No caller other than `update` passes it.
- [x] 2.5 Extend `test/integration/schema-gate.test.ts`, using a test-local ladder:
  - a behind-version store within the floor is refused by a non-update command, and the message names `ctxr update`;
  - a below-floor store is refused by `ctxr update` itself;
  - a newer store is refused by `ctxr update`;
  - the missing-version case is unchanged for `ctxr update`.
- [x] 2.6 `npx vitest run test/integration/schema-gate.test.ts` exits 0, and `npm run typecheck` exits 0.

## 3. `ctxr update` migrates in place

- [x] 3.1 In `src/commands/update.ts`, open the store in migrate mode. When a migration ran:
  - write `String(document)` to `contexture.yaml` with `writeFileAtomic` before reconciling;
  - add `contexture.yaml` to `changed`;
  - add `migrated: { from, to }` to `UpdateData`.
- [x] 3.2 In `test/unit/update-command.test.ts`, with a test-local one-step ladder, cover these spec scenarios:
  - "A store within the floor is brought forward by update" (the written file carries the supported version and reconcile ran);
  - "A failed migration writes nothing" (byte-identical file, non-zero exit, naming the step);
  - context-store's "A migration writes nothing it was not asked to" (an omitted defaulted key stays omitted).
- [x] 3.3 Assert that "Reconciling an existing store writes no configuration" still holds: an update against a store at the supported version leaves `contexture.yaml` byte-identical.
- [x] 3.4 `npx vitest run test/unit/update-command.test.ts` exits 0.

## 4. `ctxr update --worktree`

- [x] 4.1 Register `--worktree` on `update` in `src/run.ts`. The shipped-skill flag-attribution guard reads its option table from that file (`registeredOptions` in `test/unit/skills.test.ts`), so no separate list needs the flag.
- [x] 4.2 Implement the five-step flow in `src/commands/update.ts` (design D3), reusing `fetchOrigin`, `addWorktree`, `removeWorktree` (`src/core/git/worktree.ts`) and `worktreePathFor` (`src/core/session.ts`):
  1. Resolve the invoking checkout's configuration in memory.
  2. Compute the branch `<branch_prefix>ctxr-update-<CLI_VERSION>`.
  3. Detect an existing local or remote branch. If found, set `existing: true` and stop.
  4. Create the worktree from the fetched default branch, re-read and migrate the worktree's own configuration, then reconcile and generate adapter outputs there.
  5. When nothing changed, remove the worktree and delete the branch.
- [x] 4.3 Extend `UpdateData` with `worktree`, `branch` and `existing`, and keep the human summary to one line per outcome: changed, already up to date, or branch exists.
- [x] 4.4 Add `test/integration/update-worktree.test.ts` against a real repository with a bare remote, covering every scenario of "The store-update command can work in a worktree of its own":
  - a due update lands on its own branch, with no commit;
  - the invoking checkout is never written (`git status --porcelain` is empty, and the files are byte-identical);
  - a store refused at load is brought forward in the worktree, using a test-local ladder;
  - nothing due leaves nothing behind (no worktree, no branch);
  - an existing local branch, and separately an existing remote-only branch, make the run a no-op.
- [x] 4.5 In the same file, assert that `ctxr session list` reports the update worktree. This is the D3 claim that it is recognizable as a session.
- [x] 4.6 `npx vitest run test/integration/update-worktree.test.ts` exits 0.

## 5. The install location reports writability

- [x] 5.1 In `src/core/install-kind.ts`, compute `install_writable` for a `global` classification: `fs.access(W_OK)` on the resolved global `node_modules` root and on the prefix's `bin` directory (design D5). Omit it for `linked` and `undetermined`.
- [x] 5.2 Add `install_writable` to `VersionData` in `src/commands/version.ts`. The human summary keeps its current shape; that formatting choice is design.md's open question.
- [x] 5.3 Add `test/unit/install-kind.test.ts`, and assert in `test/integration/version-command.test.ts` that the field appears exactly when the install is global, with "A global install the user cannot write is distinguished": a global layout under a directory made non-writable reports `install_kind: global` and `install_writable: false`, with the success code.
- [x] 5.4 `npx vitest run test/integration/version-command.test.ts` exits 0.

## 6. `ctxr-upgrade` stops on an install it cannot write

- [x] 6.1 In `templates/skills/ctxr-upgrade.md`, step 2 gains the branch for `global` with `install_writable: false`. It stops, reports `install_path`, says the CLI is managed by whatever installed it, and names moving to a newer image (merge the image bump, pull, recreate) as the remedy when it shipped in one. It instructs no `npm install -g`.
- [x] 6.2 Check the new prose against the shipped-skill word guard and the flag-attribution guard in `test/unit/skills.test.ts`.
- [x] 6.3 Add a render assertion that the upgrade skill carries the not-writable stop before its operator-approval step. This covers the harness-portability scenario "An install the user cannot write stops the skill before any install".
- [x] 6.4 `npx vitest run test/unit/skills.test.ts` exits 0.

## 7. Documentation and full verification

- [x] 7.1 `README.md`:
  - rewrite the `schema_version` paragraph: one gate, `ctxr update` as the only migrator, the floor, and newer versions refused everywhere;
  - document `ctxr update --worktree` in the command reference: branch naming, the no-change cleanup, the existing-branch no-op, and that it never commits.
- [x] 7.2 Record, where the next schema bump will be made, that the first release raising `SUPPORTED_SCHEMA_VERSION` must ship its step and a byte-exact fixture test in the same change: the comment above `SUPPORTED_SCHEMA_VERSION` (`src/config/schema.ts`) and the `MIGRATION_STEPS` doc comment both say so. The contiguity test fails without the step; the fixture is the convention. (The repo keeps no changelog file.)
- [x] 7.3 `npm run typecheck && npm test` exits 0.
- [x] 7.4 `openspec validate migrate-stores-on-update --strict` exits 0.
