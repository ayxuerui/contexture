## Context

See proposal.md — Why. The shape of the removal is set by three existing facts:

- `mergeHookEntries` (`src/core/json-config-merge.ts`) already identifies a hook entry by
  `(matcher, script basename)`, deliberately ignoring the path prefix. Retirement needs the same
  identity, so the removal path reuses that predicate rather than inventing a second one.
- The merge's removal vocabulary (`RemovePatch`) was string-lists only, applied in the permission-rule
  branch. Hook entries could be upserted but never removed — so simply ceasing to emit the hook would
  have left every existing store carrying it forever, erroring on every edit.
- `isWriteInScope` had exactly one caller, the command being deleted. `sanctionedPath`, in the same
  module, has three others (`session-capture`, `verify`, `write-lifecycle-checks`) and stays.

## Goals / Non-Goals

**Goals:**

- Remove the gate and everything that existed only to serve it.
- Converge existing stores with no operator action and no new migration command.
- Leave the pre-push and pre-commit enforcement exactly as it is.

**Non-Goals (design-level, beyond the proposal's):**

- No general "delete any file contexture once delivered" mechanism. This deletes exactly the paths an
  adapter names as retired.
- No deprecation window on the `adapters write-gate` command. Argued in D4.

## Decisions

### D1 — Retirement removes by rule identity, not by exact command

`retiredRules` gains a `hooks` section, and the merge removes a matching entry using the same
`isSameHook` predicate that the upsert uses — now factored out so the two cannot drift.

Rationale: the permission-rule removal path is exact-match on purpose, so it can never catch a
hand-added rule. That exactness is unusable here: every release baked a different absolute path into
the command, so there is no single string to match. Matching by `(matcher, basename)` is precisely as
narrow in the way that matters — it identifies *contexture's* hook — while being blind to the one part
that was never stable. An operator's hook with a different script name, or a different matcher,
survives, and there is a test for each.

### D2 — The retired script is deleted, not left orphaned

`retireInstalledHookScript` replaces `installTemplatedHookScript`, and the adapter declares
`retiredHookFiles` where it used to declare `hookFile`.

Rationale: leaving an executable in `.claude/hooks/` that nothing invokes is worse than either keeping
or removing the feature — a reader cannot tell whether it is live. Contexture wrote the file, so
contexture removes it. The deletion is deliberately narrow: exact store-relative paths an adapter
names, never a directory and never a pattern. It is safe because the file is version-controlled, so an
operator who wants it back has it in history. Absent-is-no-change, so a converged store does not report
churn on every run.

### D3 — An emptied config is reduced, and a fresh store gains nothing

The merge now drops a list key that retirement empties, and a top-level section that ends up empty
(unless it was already empty on disk, in which case it is the operator's and is left alone).

Rationale: without this, a store whose only generated content was the hook converges to
`{"hooks":{}}`, and — worse — a *fresh* store gains a `.claude/settings.json` containing nothing but
empty sections, conjured out of a removal patch for a hook it never had. Both are noise the operator
would have to read and dismiss. The "already empty on disk" carve-out mirrors the rule the string
branch already applies to an empty array.

### D4 — The command and template go now, with no deprecation window

`ctxr adapters write-gate` and `templates/hooks/claude-code-write-gate.sh` are deleted in this change.

Rationale: the risk of removing a command an unconverged store's hook still calls is that the call
fails — and a failing `PreToolUse` hook exits non-2, which Claude Code treats as non-blocking, so the
edit proceeds. The failure mode of removing it early is therefore *exactly the retired behavior*,
reached slightly sooner. There is nothing for a deprecation window to protect. Keeping a command alive
to serve a hook that the same release deletes would be dead weight with a false rationale.

### D5 — `mainRoot` goes with it

`PermissionConfigInput` loses the field, and `adapters-generate` stops resolving `mainWorktreePath`.

Rationale: it existed solely to anchor this hook's absolute path (`stabilize-write-gate-hook-path`).
With no generated primitive invoked by a path, nothing can consume it, and keeping an input no adapter
can use invites the next author to bake an absolute path into a committed file again. Its doc comment
is replaced by a note recording why there is no such input and what to prefer instead. `mainWorktreePath`
itself stays — `harness/isolated-run.ts` still uses it.

## Risks / Trade-offs

- **The canonical checkout is now unguarded at edit time.** This is the accepted trade, and the reason
  it is acceptable is that the gate never guarded it against a shell anyway. Detection moves entirely
  to the re-scan that submit and land already perform, plus the pre-commit and pre-push hooks.
- **An unconverged store keeps the hook until its next `adapters generate` or `update`.** During that
  window the hook calls a command that no longer exists, which fails open — the same state the store
  was already in on any machine other than the generating one.
- **Deleting a tracked file during `update` is a stronger action than contexture otherwise takes.**
  Bounded by D2's narrowness, recoverable from git, and reported in the changed-files list.
