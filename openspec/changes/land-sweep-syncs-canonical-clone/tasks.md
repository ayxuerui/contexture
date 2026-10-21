## 1. One fast-forward rule

- [x] 1.1 Add `syncCanonical()` to `src/commands/land.ts`: fetch the default branch, then fast-forward only when on it, with no uncommitted changes to tracked files (D2) and an ancestor of `origin/<default>`; return `{ synced, from, to, reason }` (already current counts as synced with `from === to`)
- [x] 1.2 Use it in `afterMerge()` in place of the current fast-forward, and once at the end of every `--pending` run under the lock (D4); add a top-level `canonical_sync` to the `--pending` envelope and a warning finding when it did not sync, leaving the exit code to the landings (D3)
- [x] 1.3 Integration tests: a change merged on the forge outside `ctxr land`, then `--pending` with nothing approved syncs it and exits 0; an uncommitted tracked change, another branch checked out, and a diverged clone are each left byte-for-byte alone with the reason reported and exit 0; `land <pr>` after its merge leaves a dirty clone alone
- [x] 1.4 `npm test -- land` passes

## 2. End to end and close-out

- [x] 2.1 Integration test: a running `ctxr serve` with `change_approval`; a `contexture.yaml` change (a new decider) merged on the forge reaches the canonical clone on the next sweep, and the server admits the new decider without a restart
- [x] 2.2 README: say that a store whose `serve` lands keeps its canonical clone current within one sweep, and how an unclean clone is reported
- [x] 2.3 `npm run build && npm test && openspec validate land-sweep-syncs-canonical-clone --strict` all exit 0
