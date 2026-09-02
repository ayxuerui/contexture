## Why

`templates/conventions/baseline-convention.md` — the shipped baseline convention every store's `AGENTS.md` inlines — still tells the operator that a generated harness permission config "bakes in the absolute path of whichever checkout generated it, so it is correct for exactly that checkout and should not be committed as though it were portable; re-run the adapter's generate command in a new checkout instead." `stabilize-write-gate-hook-path` made that false: the permission config's hook command is now resolved against the store's main worktree regardless of which checkout generates it, and stays correct after that checkout is gone. Every store that runs `ctxr update` now inlines an instruction that no longer matches the tool's own behavior.

## What Changes

- Correct the sentence in `templates/conventions/baseline-convention.md` to describe the current, fixed behavior: the config anchors any absolute path it invokes at the store's main worktree, not whichever checkout ran the generator, and needs no re-running after a session worktree is removed.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — this is a prose correction to shipped documentation, not a behavior change; `stabilize-write-gate-hook-path` already specified and implemented the corrected behavior itself)

## Impact

- `templates/conventions/baseline-convention.md`: one sentence, rendered into every store's `AGENTS.md` "Git and sessions" section.
