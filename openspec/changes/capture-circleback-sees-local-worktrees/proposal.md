## Why

The first scheduled run on readyrun-brain retrieved two meetings that an interactive session in the same container
had already captured and ingested, uncommitted, in its own worktree. The runner looked only at the default branch
and open pull requests, so in-flight work was invisible to it, and the pull request it opened was a duplicate.

## What Changes

- **The runner also counts meetings found in the store's other local worktrees.** It uses `git grep --untracked`,
  so uncommitted files count too.
- **Its own review worktree is left out.** Otherwise the previous run's renders would count as present, and a
  meeting whose pull request was closed unmerged could never be retrieved again.
- **A new report section, UNPUSHED,** lists meetings held only in a local worktree, naming the worktree, so that work
  gets landed.
- **The skill text** says what counts as present, and what UNPUSHED means.

## Capabilities

### Modified Capabilities
- `harness-portability`: the Circleback skill's presence check and report.

## Impact

- `templates/skills/ctxr-capture-circleback/sweep.mjs`, `templates/skills/ctxr-capture-circleback.md`.
- `test/integration/circleback-sweep.test.ts`.
