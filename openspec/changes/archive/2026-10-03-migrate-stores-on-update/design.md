## Context

See proposal.md, Why, for the motivation. What shapes the approach:

- **One gate, in `readConfig`.** `readConfig` (`src/config/load.ts`) parses `contexture.yaml` with `yaml`'s `parse`, reads `schema_version` loosely, and refuses missing, newer or older versions before `StoreConfigSchema.safeParse`. `openStore` (`src/core/store.ts`) is its only caller apart from `init`'s reconcile path. So the gate is a single function, and every command reaches it the same way.
- **What `update` does today.** `ctxr update` (`src/commands/update.ts`) is `openStore`, then `reconcileStore` (byte-stable: a second run writes nothing and reports `changed: []`), then `generateAdapterOutputs`, then the release advisory. It writes into whatever checkout it was run from.
- **Session worktrees.** `ctxr session start` builds its worktree from `fetchOrigin` and `addWorktree` (`src/core/git/worktree.ts`), at `worktreePathFor(store, branch)` under `session.worktrees_path`, on a branch named `branch_prefix + stamp + label`. `isSessionBranch` recognizes a session by prefix alone, and `isSessionWorktreePath` by the parent directory's name.
- **The install-location report.** `ctxr version` classifies the running entrypoint with `classifyInstallPath` (`src/core/install-kind.ts`) as `global`, `linked` or `undetermined`, using the Node prefix's `node_modules` roots.
- **Round-trip check.** Both live store configurations round-trip through `yaml`'s `parseDocument` → `String(doc)` byte for byte, verified while writing this design. Renaming a key by assigning `pair.key.value` in place keeps its position, its leading comment and its trailing comment.

## Goals / Non-Goals

**Goals:**

- **Byte preservation.** A migration step's written output differs from its input only where the step says.
- **One version-reading path.** The gate's exception for `update` lives inside the same function as the gate, not in a parallel loader that could drift from it.
- **A safe unattended loop.** `ctxr update --worktree` can be called on every container start with no state of its own: same release, same branch, and nothing left behind when nothing is due.
- **No new runtime dependency.**

**Non-Goals:**

- **Locking against two concurrent `--worktree` runs on the same store.** Git's own refusal to create a branch or worktree that already exists is the lock. The losing run reports the existing branch, per the spec.
- **Reworking `session start`.** It stays exactly as it is. The update worktree reuses its building blocks, not its command.

## Decisions

### D1: Steps take a `yaml` `Document`, not a plain object

A step's signature is `(doc: Document) => void`, declared as `{ from: number, retires: string[], apply }` in an ordered array in `src/config/migrations.ts`. A step mutates the parsed document's nodes. To rename, it sets the pair's key value in place; to restructure, it moves pairs. The runner then sets `schema_version` and serializes with `String(doc)`.

*Alternative: steps on the plain `parse` output, re-serialized with `stringify`.* Rejected. It drops every comment and normalizes quoting and blank lines. That would make a migration PR a whole-file rewrite, unreviewable and in breach of the spec's "every other key, value, comment and the order of keys is written back as it was read".

*Alternative: text-level rewrites (regex over lines).* Rejected. YAML's flow and block forms, anchors and multi-line scalars make line-level edits wrong in ways a test fixture would not catch.

`retires` names each dotted key path the step renames away. That is what lets a test assert the typed schema does not declare it (D4).

### D2: The exception lives in `readConfig`, behind a mode flag

`readConfig(root, { migrate: true })` becomes the update path. It returns `{ config, document, migratedFrom }`:
- **Newer than supported, or no version at all:** throws exactly as today, in both modes.
- **Older and below the floor:** throws the new `SchemaVersionBelowFloorError` in both modes.
- **Older and at or above the floor:**
  - Default mode throws `SchemaVersionBehindError`. Its message now names `ctxr update` as the remedy, not the release notes.
  - Migrate mode runs the ladder in memory, then validates the migrated document's JS value against `StoreConfigSchema`. It writes nothing; the caller decides where to write.

`openStore` gains a matching option, and only `update.ts` passes it. Every other command keeps calling `openStore` unchanged and gets the gate unchanged. The floor is `min(step.from)`, or `SUPPORTED_SCHEMA_VERSION` when the ladder is empty, which it is at merge. So the behind-version message names `ctxr update` only for a version the CLI can actually carry.

*Alternative: a separate `loadForUpdate` beside `readConfig`.* Rejected. Two loaders means two gates, and the retired change's whole point was "one gate, one message".

### D3: `--worktree` resolves the configuration twice, from two different trees

The update worktree is checked out from the freshly fetched `origin/<default>`, which can be ahead of the invoking checkout. The canonical clone in a container is refreshed only when something pulls it. So:

1. **Read the invoking checkout's configuration** in migrate mode, in memory only. It supplies `session.branch_prefix`, `session.worktrees_path` and `git.default_branch` in their *migrated* shape, so a step that renames one of those keys cannot strand the command before it starts.
2. **Compute the branch:** `<branch_prefix>ctxr-update-<CLI_VERSION>`. If it exists as `refs/heads/<branch>`, or on the remote (`git ls-remote --heads origin <branch>` when a remote exists), report it with the success code, set `data.existing: true`, and stop.
3. **Fetch the default branch and create the worktree** at `worktreePathFor({ root, config }, branch)`, starting from `origin/<default>`, or from the local default branch when there is no remote. This is the same fallback `session start` uses.
4. **Re-read the worktree's own `contexture.yaml`** in migrate mode. That file, not the invoking checkout's, is what the branch changes. If it migrated, write `String(doc)` with an atomic write. Then run `reconcileStore` and `generateAdapterOutputs` with the worktree as root.
5. **If nothing changed** (no migration, empty `changed`): `git worktree remove` and `git branch -D`, then report "already up to date".

The branch carries the configured prefix, so `isSessionBranch` recognizes it, and the worktree sits under `worktrees_path`, so `isSessionWorktreePath` does too. `session list` shows it, and the lifecycle skill's submit and reclaim steps work on it unchanged. It is a session in every sense except that `session start` did not create it.

*Alternative: reuse `session start`'s stamp-plus-label naming with a fixed label.* Rejected. The stamp changes every second, so two boots a day apart would create two branches, and a PR already open from the first would not stop the second. The spec requires one branch per release.

*Alternative: let the caller pass a worktree path and branch.* Rejected. Every caller would have to re-derive the configured prefix and worktrees path, from a configuration it cannot read through ctxr while the store is behind.

### D4: Two tests are the enforcement, as the spec's rule requires

- **Ladder contiguity** (`test/unit/config-migrations.test.ts`): for every `v` from the floor up to `SUPPORTED_SCHEMA_VERSION - 1`, exactly one step has `from === v`. A release that bumps the version without a step fails here, naming the gap.
- **No retired spelling is live:** for every step, every path in `retires` resolves to no declared key in `StoreConfigSchema`'s shape. This is the check that turns the retired change's D1 into an assertion rather than an aspiration.

Each step also ships with a fixture test: a configuration with comments and non-default ordering, migrated, compared byte for byte against an expected file. It is a per-step convention, not a gate, since a step's correctness is its own content.

### D5: Writability is checked where npm would write

For an install classified `global`, `ctxr version` adds `install_writable: boolean`. It is `fs.access(..., W_OK)` on two directories: the `node_modules` root the entrypoint resolves under (`globalRootsFor`, already computed), and the `bin` directory beside the prefix. `npm install -g` needs both. For `linked` and `undetermined` the field is omitted, because there is no package-manager target to judge.

`templates/skills/ctxr-upgrade.md` adds the branch at its install-kind step: `global` with `install_writable: false` stops, naming `install_path` and the image route. The skill prose is checked against the shipped-skill word guard and the flag-attribution guard before it lands.

*Alternative: catch `EACCES` from `npm install -g` in the skill.* Rejected. It reaches the failure only after the operator's approval gate has been spent on an install that could never succeed.

### D6: No "rendered by" stamp

Considered for case A and declined, as the proposal records. `--worktree` against a throwaway worktree answers "is an update due?" exactly, because reconcile is byte-stable. A stamp would have to be a tracked file. It would change on every release, including releases that change nothing in the store, so every boot after an image bump would produce a PR whose only content is the stamp.

## Risks / Trade-offs

- **The canonical clone stays behind after the migration PR merges.** In a container, `session start` reads the canonical clone's `contexture.yaml`. Until that checkout is pulled, it is still refused, even though `main` is fixed.
  → The provisioner's refresh pulls it when it is clean. The contexture-images boot hook should pull the canonical clone fast-forward-only and clean-only before running `--worktree`. Recorded here because it decides whether the follow-up works, not because this change can fix it.
- **A wrong step rewrites configuration.** → Three layers catch it:
  - the migrated document is validated against the typed schema before anything is written;
  - each step has a byte-exact fixture test;
  - the result lands on a branch for review, never on the default branch.
- **The ladder starts empty, so none of this runs until the first schema bump.** → Intended: both live stores are at version 10. The contiguity test still runs against an empty ladder (floor equals supported, nothing to check). What it guards begins with the first bump.
- **`--worktree` and the release advisory.** `update` consults the registry, and a boot loop would call it on every start. → The advisory is cached for `update_check.ttl_hours` (24 by default) and is suppressible. A boot loop costs at most one registry request a day.
- **The invoking checkout's prefix differs from the remote's.** For example, a merged PR changed `session.branch_prefix` and the canonical clone hasn't been pulled. → The branch name follows the invoking checkout. The worst case is a branch under the old prefix that `session list` still recognizes by its worktree path. It is not worth a second fetch-and-read before the branch is chosen.

## Migration Plan

No store changes at merge: the ladder is empty and both live stores are at the supported version.

Rollout:
1. Release with this change.
2. contexture-images adds the boot hook: refresh the canonical clone, then `ctxr update --worktree`, then submit the branch if it reports changes.
3. The first release that bumps `schema_version` ships its step and fixture in the same change.

Rollback: revert the commit. No store file is written by this change until a step exists, so there is no state to undo.

## Open Questions

- **Where `install_writable` goes in the human (non-JSON) summary of `ctxr version`**: on the same line, or only in the JSON envelope. Formatting only; it changes nothing above.
