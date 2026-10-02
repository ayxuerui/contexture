## Context

See proposal.md — Why. Everything the new step needs already exists:

- `resolveExistingRoot` (`src/core/root.ts`) already walks up from cwd looking for
  `contexture.yaml`, and already resolves the worktree correctly when the environment variable is
  unset. The walk is the missing answer; it is only outranked.
- `isLinkedWorktreeRoot` (`src/core/git/repo.ts`) already decides "is this directory a linked
  worktree", filesystem-only and synchronous, and already documents why it avoids a subprocess:
  `write-lifecycle/path-gate.ts` calls it on every gated tool call. This change needs the same
  question asked of a *named* store, so the module gains a sibling rather than a second technique.
- `listWorktrees`/`mainWorktreePath` (`src/core/git/worktree.ts`) already run repo-wide and already
  document themselves as correct "whichever linked worktree the command was invoked from" — so
  `ctxr session list` returns the same list either way, and nothing downstream of this change has to
  care which checkout resolved.

The constraint that shapes the implementation: `resolveExistingRoot` is synchronous, has no
`GitRunner`, and runs ahead of every command. Whatever the new step does, it must be pure
filesystem, cheap, and total — never throwing, never blocking, and falling back to today's answer on
anything it cannot decide.

## Goals / Non-Goals

**Goals:**

- Make `ctxr <anything>` from inside a session worktree operate on that worktree.
- Preserve the environment variable's actual purpose — naming which *store* — exactly.
- Keep the resolver synchronous, subprocess-free, and total.

**Non-Goals (design-level, beyond the proposal's):**

- No new flag, variable, or config key.
- No git subprocess in the resolution path, at any cost in precision.
- No attempt to handle a worktree whose administrative files have been relocated by a mechanism
  contexture does not itself use (`$GIT_COMMON_DIR` pointed elsewhere, a repo whose `.git` is
  neither a directory nor a `gitdir:` file). These fall back to current behavior.

## Decisions

### D1 — The step goes between `--root` and the environment variable, and is consulted only when the variable would resolve

Precedence becomes: `--root`; the cwd's store when it is a linked worktree of the store the variable
names; the variable; the cwd walk.

Rationale: placing it below `--root` keeps an explicit argument absolute — a caller who names a root
has answered both questions and must be taken literally. Gating it on "the variable would otherwise
resolve" means the step is dead code in every environment that does not export it: the cwd walk
already reaches the same directory, so there is nothing to redirect. That confines the entire
behavior change to one case — variable set, caller standing in a worktree of that same store — which
is precisely the case that returns the wrong checkout today.

### D2 — Sameness is decided by the worktree's own `gitdir:` pointer, not by comparing git common dirs

A linked worktree's `.git` is a file reading `gitdir: <path>`, where `<path>` is that worktree's
administrative directory inside the owning repository — `<owner>/.git/worktrees/<name>`. The
candidate belongs to the named store when that path, resolved, sits inside
`<store>/.git/worktrees/`.

Rationale: the alternative — `git rev-parse --git-common-dir` on both sides and compare — is what a
human would type, and it is more robust to exotic layouts. It is rejected here because it needs two
subprocesses in a synchronous function that runs before every command, for a question the filesystem
answers directly. `isLinkedWorktreeRoot` already made this trade for the same reason and states it;
this follows the precedent rather than opening a second one. The cost is the narrow layouts listed
under Non-Goals, all of which degrade to today's behavior rather than to a wrong answer.

Git may write the pointer as a path relative to the worktree (`git worktree add --relative-paths`,
git 2.48+), so the pointer is resolved against the candidate directory before comparison. Both forms
are tested.

### D3 — Containment is compared on resolved paths, with a separator-anchored prefix

`<store>/.git/worktrees` is compared with `path.relative`, requiring the result to be non-empty and
to escape neither upward (`..`) nor into an absolute path. A plain `startsWith` on the string would
match `/store/.git/worktrees-backup/x` against `/store/.git/worktrees`.

Rationale: this is the ordinary prefix-matching trap and the codebase should not re-acquire it in a
security-adjacent position — the redirect decides which tree subsequent commands write to.
`realpath` is deliberately NOT called: it would turn a symlinked store root into a non-match against
the operator's own configured path, and the failure mode of skipping it is falling back to current
behavior.

### D4 — Redirect, not warn

The conservative candidate was to leave resolution alone and print a diagnostic when cwd is a
worktree of the resolved store: "resolved `/store`, but you are standing in `/store/.worktrees/x`;
pass `--root .`".

Rejected as the primary fix. It ends the silence but not the defect: the wrong tree is still the one
audited, and every caller pays attention tax forever on a condition the tool could simply handle. It
also lands the warning in the one place work normally happens — inside a worktree — so it would fire
constantly and be tuned out, which is how a warning becomes worse than nothing. And it cannot fix
the asymmetry that motivates the change: a real failure inside the worktree stays masked by a clean
canonical clone, warning or no warning.

Not ruled out as an addition later, on the inverse condition (`--root` naming a checkout the caller
is not in). That is a different signal and not needed here.

### D5 — No opt-out

No flag, no config key, no environment escape hatch.

Rationale: the behavior being replaced is not one a store would choose. Making it configurable would
institutionalize a defect as a preference and guarantee both paths must be supported forever. A
caller who genuinely wants the canonical clone from inside a worktree has the answer already and it
is better than a flag: `--root "$CONTEXTURE_STORE_ROOT"`, explicit at the call site.

### D6 — `init` keeps its own resolver, untouched

`resolveRootForInit` does not gain the step.

Rationale: `init` creates a store rather than finding one. Redirecting it into an existing worktree
would let `ctxr init` silently re-target a checkout of a store that already exists — the same class
of accident its existing "never walks up" rule was written to prevent.

## Risks / Trade-offs

- **A caller relying on the variable to pin the canonical clone from inside a worktree changes
  behavior.** This is the one real break, and it is the intended one. Surveyed before proposing: the
  shipped conventions direct canonical-clone git work through an explicit `git -C "$STORE_ROOT"`
  rather than through cwd plus env pinning, and `ctxr session list` is unaffected because
  `git worktree list` is repo-wide. Anything that does rely on it has the explicit
  `--root "$CONTEXTURE_STORE_ROOT"` form available and is more readable for it.
- **The detection is narrower than git's own.** Exotic administrative layouts are not recognized and
  fall back to the current answer. Failing closed to today's behavior is the correct direction for a
  step that changes which tree gets written.
- **Nothing in normal output names the resolved root.** Out of scope here; `--json` already carries
  `store.root`, which is what made the original misdiagnosis recoverable.
