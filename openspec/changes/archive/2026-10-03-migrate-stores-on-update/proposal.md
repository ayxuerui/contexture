## Why

A store can now be operated from a container image that ships `ctxr` (contexture-images' `contexture-hermes`), and there the CLI changes when someone pulls a newer image, not when someone runs the upgrade skill. That leaves the store behind in two ways.

- **Its generated files lag the binary.** Nothing re-renders them. The session-start advisory compares the installed release against the registry, and right after an image pull those agree, so it stays silent. `ctxr-upgrade` stops at "already current". This is case A.
- **Its recorded `schema_version` is older than the release supports.** Every command is then refused at configuration load, including `ctxr update`, and the only remedy is a hand edit to `contexture.yaml` described in the release notes. Until someone makes that edit, no ctxr-driven skill runs at all, so the agent cannot recover the store from inside the container. This is case B.

Hermes, the harness that image runs, has exactly this problem with its own `config.yaml` and solves it in the shape this change borrows. An ordered ladder of `_migrate_to_N` steps rewrites the **raw** YAML before the typed configuration is read. A support floor refuses what is too old to carry. Every image boot runs the ladder before any service starts.

This partially reverses `2026-09-08-retire-store-migrations`. That change rested on two arguments.

1. **No migration had ever run, because both stores were kept current by hand on a host.** That was true then. It stops being true once the CLI arrives by image pull and the agent operating the store cannot get past the gate it is refused at.
2. **The real cost was leniency.** Every migration needed `StoreConfigSchema` to accept the superseded spelling it was about to rewrite (that change's D1). Migrating the raw document *before* the typed schema reads it removes that cost. The live schema keeps exactly one spelling per key, which is the property D1 was protecting.

## What Changes

- **BREAKING (spec): migrations return, on the raw document only.** contexture ships an ordered ladder of schema migration steps, one per supported version bump. Each step rewrites `contexture.yaml`'s parsed YAML document, keeping comments and key order, before any typed parse. Two things are enforced by a test, not by convention:
  - `StoreConfigSchema` still accepts exactly one spelling per key.
  - Every version from the ladder's floor up to the supported version has a step.
- **Only `ctxr update` may open an older store.** It migrates the store forward, then reconciles as it does today. Every other command keeps the both-directional refusal. Their behind-version message now names `ctxr update` as the remedy when the store is within the ladder's floor. Below the floor, and for a store newer than the CLI, the refusal is unchanged and `update` refuses too.
- **New: `ctxr update --worktree`.** The command creates its own worktree from the freshly fetched default branch, on a branch named deterministically from the release (`<branch_prefix>ctxr-update-<version>`), and migrates and re-renders there.
  - It never writes the checkout it was invoked from.
  - It needs no `ctxr session start`, which a store refused at load cannot run.
  - When nothing changes, it removes the worktree and branch and reports so.
  - When the branch already exists, it reports the branch and changes nothing.
  - It does not commit, push or open a pull request. Those stay with the caller, consistent with git sequencing living outside the CLI.

  This is what lets a container boot hook handle both cases unattended: run it, and if anything changed, submit the branch.
- **`contexture.yaml` gains a second writer.** A migration step may rewrite the file, but only the keys its step names plus `schema_version`, and never a recorded value: a value moves only with its key. `init` is no longer the only writer. Reconciling a store already at the supported version still writes no configuration.
- **The version report says whether its install location is writable.** `ctxr version` reports whether the running user can write where a package-manager upgrade would install. `ctxr-upgrade` stops on a global install the user cannot write to, and says the CLI is managed by whatever installed it: in the image, merge the image bump, then pull and recreate. Today it runs `npm install -g` into `EACCES`.

## Non-goals

- **The container boot hook.** Running `ctxr update --worktree` at boot, then committing, pushing and opening the PR, is contexture-images' follow-up and depends on this change. Nothing here assumes a container.
- **Committing, pushing or opening a pull request from the CLI.** Git sequencing past the worktree lives in skills and deployment tooling, as it has since session submit/land were removed. The worktree is where the CLI's responsibility ends.
- **Merging the result automatically.** A migration rewrites configuration, which is exactly where review earns its cost. Whether a deployment auto-merges contexture-owned-only changes is that deployment's policy, not this tool's default.
- **A recorded "rendered by" version for case A.** It was considered and declined. `ctxr update --worktree` against a throwaway worktree is already an exact answer to "is an update due?", because reconcile is byte-stable and reports exactly what it would change. A version stamp is a proxy that would churn on every release, including releases that change nothing in the store.
- **Reinstating the eight retired migrations, or `ctxr migrate`.** Both live stores are at `schema_version: 10`. The ladder starts empty at 10, and its first step ships with the first release that bumps the version.
- **Migrating down.** A store newer than the CLI stays refused everywhere. The remedy is a newer CLI, and for the image that means a newer tag.
- **Backup copies of `contexture.yaml`.** Hermes snapshots its config because that file is local, unversioned state. A store's configuration is committed, and `--worktree` writes only to a branch, so git already holds the previous version.
- **Migrating notes or other operator content.** Steps rewrite `contexture.yaml` only. Generated files are already brought forward by reconcile, and operator content stays outside contexture's write authority.

## Capabilities

### New Capabilities

_None. Every requirement this change touches belongs to a capability that already exists._

### Modified Capabilities

- `store-lifecycle`:
  - The schema-version gate gains its one exception: `update` may open an older store within the ladder's floor.
  - "contexture ships no migration mechanism" is removed, and a requirement for the raw-document ladder and its support floor is added in its place.
  - A new requirement covers `ctxr update --worktree`.
  - The shipped-default requirement stops naming `init` as the only writer.
- `context-store`: the written-configuration requirement names the migration as the second writer and bounds what it may write.
- `cli-contract`: the version report adds whether the install location is writable.
- `harness-portability`: the `ctxr-upgrade` requirement stops on a global install the running user cannot write to.

## Impact

- **New code:**
  - `src/config/migrations.ts`: the ladder, its floor, and a runner over a `yaml` `Document`.
  - A contiguity test.
  - A test asserting that `StoreConfigSchema` declares no superseded spelling.
- **`src/config/load.ts`:** `readConfig` gains an update-only path that migrates before validation. `SchemaVersionBehindError` names `ctxr update` within the floor, and a new error covers below-floor stores.
- **`src/commands/update.ts`, `src/run.ts`:**
  - `--worktree`, with deterministic branch naming and the no-change cleanup.
  - The worktree's creation reuses `src/core/git/worktree.ts` (`fetchOrigin`, `addWorktree`).
  - It resolves the migrated configuration in memory first, so `session.worktrees_path`, `session.branch_prefix` and `git.default_branch` are read in their new shape.
- **`src/core/install-kind.ts`, `src/commands/version.ts`:** the install location reports writability.
- **`templates/skills/ctxr-upgrade.md`:** the new stop branch.
- **`README.md`:** the schema-version paragraph and the `update` command reference.
- **Tests:**
  - Revised: `test/integration/schema-gate.test.ts`, the update and version command tests, and the skills render tests.
  - New: integration tests for `--worktree` against a real repository with a remote.
- **Downstream:** none at merge. Both live stores are at the supported version, so the ladder is empty and has nothing to run. contexture-images' boot hook is the first consumer and lands separately.
