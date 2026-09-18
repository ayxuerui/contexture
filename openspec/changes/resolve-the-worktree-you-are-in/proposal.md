## Why

Contexture cuts the session worktree itself. `ctxr session start` creates it, reports its path, and
the write-path convention it ships tells every agent to do all subsequent work there. Then its own
root resolution ignores that the agent is standing in it: with `CONTEXTURE_STORE_ROOT` exported —
which is how a harness normally supplies the store, and what the shipped conventions recommend for
any command needing an absolute path — every `ctxr` command run from inside the worktree resolves to
the canonical clone instead.

The failure is silent and it points both ways. `ctxr doctor` run from a session worktree audits
`main`, so a pre-existing failure there is reported against work that did not cause it, and a real
failure inside the worktree is masked by a clean canonical clone. Nothing in the output says which
tree was read; an operator sees `11 passed, 1 failed` and has no reason to doubt it applies to the
work in front of them. `ctxr lint`, `ctxr catalog build`, `ctxr publish check` and every other
store-scoped command have the same shape.

The precedence itself is not the bug. An explicit environment variable beating an implicit cwd walk
is the right call. The bug is that the variable is being asked a question it does not answer:
`CONTEXTURE_STORE_ROOT` names **which store**, and a worktree raises **which checkout of that
store** — a second, orthogonal axis the resolver has no step for, so it silently answers the first
question and returns a different checkout than the caller is standing in.

Three facts say the missing step is well defined and cheap. Unset the variable and the existing cwd
walk already resolves the worktree correctly, so the information is present and is simply outranked.
A session worktree carries its own `contexture.yaml` and `.contexture/`, so it is a valid store root
on the resolver's own terms, not a special case. And the rest of the codebase already expects to run
from a linked worktree — `mainWorktreePath` documents itself as correct "whichever linked worktree
the command was invoked from".

## What Changes

- Root resolution for every command except `init` gains one step, consulted only when
  `CONTEXTURE_STORE_ROOT` is what would otherwise resolve: if walking up from the current directory
  finds a store root that is a **linked worktree of the very store the variable names**, that
  worktree resolves instead.
- The step is scoped to one store. When the cwd store and the variable's store are different
  repositories — the cross-store case the variable exists for — the variable still wins, unchanged.
- Detection is filesystem-only and synchronous, reusing how git itself distinguishes a linked
  worktree from a main working tree: `.git` is a directory in a main working tree and a file reading
  `gitdir: <path>` in a linked one. A worktree belongs to the named store when that path resolves
  inside `<store>/.git/worktrees/`.
- `templates/agents/canonical.md`'s "Root resolution" paragraph states the new step, so every store's
  regenerated `AGENTS.md` describes what the resolver does.

Not breaking in any case that resolves today: `--root` is untouched and still beats everything; the
cwd walk is untouched; the superseded-variable refusal is untouched; and the variable's behavior
changes only when the caller is standing inside a worktree of the same store, which is exactly the
case that returns the wrong checkout now. `init` is deliberately excluded — it creates a store rather
than finding one, and has its own resolver.

## Capabilities

### New Capabilities

None. The change lands on the existing `harness-portability` capability.

### Modified Capabilities

- `harness-portability`: the root-resolution precedence requirement gains the worktree step and the
  scenarios that pin it, including the cross-store case that must NOT redirect. The
  one-variable/one-flag requirement and the superseded-name refusal are untouched — no flag and no
  variable is added.

## Non-goals

- **Warning instead of redirecting.** A diagnostic on stderr would end the silence without changing
  behavior, and it was the conservative candidate. It is rejected as the primary fix because it
  leaves the wrong tree being audited and puts the burden back on the operator to notice prose and
  re-run — and because a warning printed on every command inside a worktree is noise in exactly the
  place work normally happens. Argued in design.md D4.
- **Changing where `--root` sits.** An explicit argument stays absolute. A caller who names a root is
  answering both questions at once and deserves to be taken literally.
- **Making the redirect conditional on a flag or config key.** The current behavior is not something
  a store would reasonably opt into; a key would institutionalize a defect as a preference. Argued in
  design.md D5.
- **Touching `resolveRootForInit`.** `init` constructs a store, and redirecting it into an existing
  worktree is the opposite of what it is for.
- **Teaching root resolution about worktrees in general** — enumerating them, validating their
  branches, preferring one over another. The step answers one yes/no question about the directory the
  caller is already in.
- **A `schema_version` bump, a config key, or a migration.** Nothing about a store on disk changes.
