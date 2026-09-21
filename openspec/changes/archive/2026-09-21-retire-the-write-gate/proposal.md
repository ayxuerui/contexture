## Why

The write gate is a Claude Code `PreToolUse` hook, generated into `.claude/settings.json`, that denies
edits under the store root outside the active session worktree. It does not do what the store's
conventions say it does.

**A `PreToolUse` matcher filters on tool name, and the gate's matcher is `Edit|Write|NotebookEdit`.**
Any agent holding a shell writes past it — `sed -i`, a heredoc, a python one-liner — none of which are
exotic. Writing files through a shell is ordinary agent behavior, so the gate is not a boundary an
agent has to work to defeat; it is one that most sessions never touch.

**It is single-harness in a tool whose premise is harness portability.** Codex, Cursor, a human at a
terminal, and every scheduled job operate entirely ungated, while the shipped conventions describe the
write path as enforced.

**It has been failing open in practice.** Its command was an absolute path baked in at generation time;
on a store shared between machines, that path names a directory that does not exist on the others. A
hook command that cannot be found exits 127, and Claude Code treats any non-2 exit as a non-blocking
error and lets the tool call proceed — so on every machine but the generating one, the gate silently
allowed everything. The predecessor change `reference-the-hook-by-project-dir` was drafted to fix
exactly this, and prompted the question this change answers instead: whether the thing being repaired
earns its place.

It does not. What the gate uniquely catches is an edit to the canonical checkout instead of the session
worktree — low severity, already surfaced by the working-tree re-scan that precedes both submit and
land, and undone by moving the change. What actually holds the write path is specified in
`write-lifecycle` and is untouched here: a version-controlled pre-push hook refusing a push to the
default branch, and a version-controlled pre-commit hook validating staged changes. Neither can be
evaded by choosing a different tool, and both apply to every harness equally.

Widening the matcher to `Bash` is not a rescue. The gate would then have to decide which paths an
arbitrary shell command writes, which is not reliably derivable — and a gate that is partial while
presenting as total is worse than none, because the conventions keep telling agents they are protected.

## What Changes

- The `claude-code` adapter stops emitting the write-gate hook. Its permission config becomes
  cleanup-only: it renders nothing, and retires what earlier releases wrote.
- `contexture adapters generate` removes the retired hook entry from an existing config, identified by
  matcher and script filename rather than by exact command — no release baked the same absolute path,
  so no exact string would match another machine's copy. An operator's own hook is untouched.
- The orphaned script is deleted from the store. Contexture installed it; contexture takes it away.
- A permission config left with no contexture-contributed content is reduced rather than left holding
  empty sections, and a store that never had one does not gain one.
- Removed outright: the `ctxr adapters write-gate` command, its hook template, `isWriteInScope`
  (its only consumer), and the `mainRoot` adapter input that existed solely to anchor the hook's
  absolute path.
- The shipped baseline conventions drop the sentence describing the permission config's absolute-path
  anchoring, and `init`'s harness description stops advertising the hook.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `adapters`: the requirement specifying the generated permission config's write-scoping primitive is
  REMOVED, with its reason and migration recorded. The repair/convergence requirement is MODIFIED to
  cover identity-based removal of a retired entry, deletion of a retired script, and reducing a config
  that retirement empties. The adapter-registry, interface-version, and skills-directory requirements
  are untouched.
- `write-lifecycle` is deliberately unmodified. Its pre-push and pre-commit requirements are the
  enforcement that remains, and they never depended on the gate.

## Non-goals

- **Weakening the pre-commit or pre-push hooks.** They are the load-bearing, harness-agnostic
  enforcement and are untouched.
- **Replacing the gate with a different harness-side primitive.** The reason for retirement is that a
  tool-name-matched gate cannot be sound against an agent with a shell; a differently-shaped one in the
  same position inherits that.
- **Removing `permissionConfig` from the adapter interface.** It still carries retirement for stores
  that have not converged. Collapsing it now would strand them.
- **Changing what `sanctionedPath` does.** The pre-commit path allowlist and the capture gate both use
  it and are unaffected; only `isWriteInScope`, which had no other caller, goes.
