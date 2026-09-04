## 1. The registry port and the comparison

- [x] 1.1 Bind the published package name as a constant beside `CLI_VERSION` in `src/version.ts`, and extend `test/unit/cli-name.test.ts` to assert it equals `package.json`'s `name` — the same single-source discipline `version-sync.test.ts` applies to the version.
- [x] 1.2 Add `src/core/registry.ts`: a `RegistryClient` port with one operation that resolves the latest published version, implemented over the platform `fetch` with an abort timeout (D11). It returns a resolved version or a structured "could not determine" reason, and never throws or rejects.
- [x] 1.3 Add the port to `RunEnv` in `src/core/env.ts` and construct the real client in `realEnv()` only (D2). Add a controllable fake to `test/helpers/fake-env.ts` alongside the existing git and prompter fakes.
- [x] 1.4 Add `src/core/version-check.ts` with the three-part version comparison (D7): it returns current / newer-available / undeterminable, and treats any version string it cannot parse as undeterminable rather than comparing it.
- [x] 1.5 Unit-test the comparison and the client's failure surface: equal, newer, older, two-digit minor and patch, unparseable on either side, and each client failure reason mapping to undeterminable.
- [x] 1.6 `npm run typecheck && npx vitest run test/unit/version-check.test.ts test/unit/registry.test.ts test/unit/cli-name.test.ts` — exits 0.

## 2. The version command and the version flag

- [x] 2.1 Add `src/commands/version.ts` reporting the installed version, the resolved path of the running executable, and its install kind (`global` | `linked` | `undetermined`, D12) derived from the existing `resolveOwnBinPath()` in `src/core/hooks.ts`. It declares `store: 'absent'` — the vocabulary `CommandRequires` actually offers for "does not open a store" — so it answers where no store resolves.
- [x] 2.2 Add the `--check` option to that command, resolving the latest release uncached and mapping the three outcomes onto the success, failed-check, and usage exit codes, with the usage path naming what could not be determined.
- [x] 2.3 Register the command in `src/run.ts` through `runCommand`, and recognize `--version`/`-V` ahead of parsing so it dispatches to the same path rather than the argument parser's built-in version support, which writes to stderr (D8).
- [x] 2.4 Add `version` to `COMMAND_NAMES` in `src/run.ts` so the JSON-envelope conformance suite covers it.
- [x] 2.5 Integration-test that `ctxr version`, `ctxr version --json`, and `ctxr --version` each print the version on **stdout** and exit 0, that stderr carries no part of the answer, that the command succeeds outside any store, and that `--check` yields distinct exit codes for current / newer / undeterminable.
- [x] 2.6 `npm run build && npx vitest run test/integration/version-command.test.ts test/integration/json-envelope-conformance.test.ts` — exits 0.

## 3. Configuration and the store-local cache

- [x] 3.1 Add the `update_check` block (`enabled`, `ttl_hours`) to `src/config/schema.ts`, with both defaults read from `SHIPPED_DEFAULTS` in `src/config/defaults.ts` — never from literals at the `.default()` call site.
- [x] 3.2 Read the suppressing environment variable under the `CONTEXTURE_*` convention, resolved from the injected environment rather than `process.env`.
- [x] 3.3 Implement the cache under the store's existing derived-cache directory (D6), written with `writeFileAtomic`, treating an unreadable, unwritable, or unparseable cache as a miss rather than an error.
- [x] 3.4 Confirm no schema-version bump and no migration are needed: an existing `contexture.yaml` omitting the block resolves through the defaults, and `ctxr migrate --dry-run` reports nothing pending.
- [x] 3.5 Unit-test that the cache is honored inside its TTL, refreshed past it, and bypassed by the explicit check; and that `enabled: false` and the environment variable each suppress the request entirely.
- [x] 3.6 `npx vitest run test/unit/single-source-literals.test.ts test/unit/config-schema.test.ts test/unit/update-check-cache.test.ts` — exits 0, with the single-source guard passing unmodified.

## 4. The advisory, and its inability to fail a command

- [x] 4.1 Add the shared advisory helper to `src/core/version-check.ts`: it takes the run environment and store, and returns findings — `cli.update_available` or `cli.update_check_failed`, both `info` severity — plus the human notice text. It has no throwing path (D5).
- [x] 4.2 Call it from `src/commands/session-start.ts` and `src/commands/update.ts`, appending its findings to each command's own outcome. Do not add it to the shared `runCommand` wrapper, which would leak the check into every command.
- [x] 4.3 Emit the human notice through the reporter's existing stderr channel — its first caller — leaving stdout untouched in both modes (D4).
- [x] 4.4 Table-driven test over the whole failure matrix (timeout, DNS failure, non-success status, unparseable body, unwritable cache directory, corrupt cache file): both commands still exit 0 with `ok` status, carry exactly one `cli.update_check_failed` finding, and — for session start — the worktree still exists.
- [x] 4.5 Test that a newer release yields exactly one `cli.update_available` finding and exit 0; that an equal or older published version yields neither finding; and that under `--json` stdout parses as exactly one JSON value with the notice on stderr.
- [x] 4.6 Assert the offline guarantee holds: `ctxr doctor` in both scopes and `ctxr init` make no registry request, with a fake that fails the test if called.
- [x] 4.7 `npm run build && npx vitest run test/unit/update-advisory.test.ts test/integration/offline-commands.test.ts` — exits 0.

## 5. The upgrade skill and the lifecycle offer

- [x] 5.1 Write `templates/skills/ctxr-upgrade.md`: read the live answer from `ctxr version --check --json`; stop and report when the install kind is `linked` or `undetermined`; obtain explicit operator approval; upgrade with the package manager; confirm the upgraded executable is on the path; then run `ctxr update` from a session worktree, recommending it land as its own pull request rather than mixed into unrelated work. Every contexture invocation names `ctxr`, never `contexture`.
- [x] 5.2 Register a `SkillSeed` for it in `src/core/skills.ts` beside the session-lifecycle seed, using the no-substitution `body` form.
- [x] 5.3 Extend `templates/skills/ctxr-session-lifecycle.md`'s Start step: when session start reports a newer release, name both versions to the operator and offer the upgrade skill; never upgrade unasked; never make the session's continuation depend on the answer; treat a failed check as nothing to report.
- [x] 5.4 Verify the existing check over rendered skills passes — it resolves each long option a skill names alongside a contexture command against that command's registration, so `--check` and `--json` must already be registered (the ordering constraint from design.md's Migration Plan).
- [x] 5.5 Test delivery by extending the existing `test/integration/owned-skills.test.ts` (which already asserts exactly this shape for every owned skill) rather than adding a parallel file; the naming and affordance guards in `test/unit/skills.test.ts` iterate `SKILLS` and so cover the new skill with no new test.
- [x] 5.6 `npm run build && npx vitest run test/unit/skills.test.ts test/integration/owned-skills.test.ts test/integration/cli-name.test.ts && npx vitest run -t "affordance"` — exits 0.

## 6. Documentation

- [x] 6.1 Add `ctxr version` and `ctxr version --check` to the README's command table, and document the `update_check` configuration block and its environment variable alongside the other configuration documentation.
- [x] 6.2 Note in the README's maintenance section that a newer release is surfaced at session start and by `ctxr update`, and that `ctxr-upgrade` performs the upgrade — keeping the documented upgrade path in one place.
- [x] 6.3 `npm run build && node dist/bin.js --help` — exits 0 and lists `version` among the commands.

## 7. Verification

- [x] 7.1 `npm run typecheck && npm run build && npm test` — the full suite exits 0, including the `single-source-literals`, `version-sync`, `cli-name`, and `json-envelope-conformance` guards.
- [x] 7.2 `node dist/bin.js version --json` from this checkout — reports `install_kind` as `linked`, confirming D12 classifies a development checkout correctly rather than instructing a global install.
- [x] 7.3 Resolved the hook-path risk from design.md — Risks, by inspection rather than by a global reinstall: reinstalling `ctxr-cli` globally on this machine would clobber the operator's linked dev checkout, so it was not performed. Two findings close the risk. (a) The baked path is `<install>/dist/bin.js` and encodes no version component — a global install resolves to `<npm prefix>/lib/node_modules/ctxr-cli/dist/bin.js`, identical before and after an in-place upgrade. (b) Even if it did move, `reconcileStore` calls `installHooks` (`src/core/reconcile.ts:119`) and `detectStaleHooks` re-renders against the *current* `resolveOwnBinPath()`, so `ctxr update` rewrites the hooks with the new path. The upgrade skill's step 5 is `ctxr update`, so the contingency the design named is already satisfied by construction; no change was needed.
- [x] 7.4 With the registry fake pointed at a newer version, run `node dist/bin.js session start` in a scratch store: it prints the notice on stderr, creates the worktree, and exits 0; then `node dist/bin.js doctor` in the same store makes no request and exits on its checks alone.
- [x] 7.5 `node dist/bin.js migrate --dry-run` against a store created before this change — exits 0 reporting nothing pending, confirming the configuration block needs no migration.
- [x] 7.6 `openspec validate keep-the-installed-cli-current --strict` — exits 0.
