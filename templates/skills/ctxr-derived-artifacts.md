A derived artifact is the deterministic output of a build over the store: catalog sections, the graph,
the generated AGENTS.md sections, the entry files, the owned skills, adapter outputs. They rot two ways —
stale (the source moved, the artifact did not) and clobbered (a build against the wrong base, or a hand
edit inside a fence that the next build erases).

1. Identify the source of truth and the builder: catalog ← notes (`ctxr catalog build`); graph ← notes
   (`ctxr graph build`, lives under the cache paths, never committed); AGENTS.md sections, entry files,
   skills, hooks ← config + the installed package (`ctxr update`); adapter outputs ← config
   (`ctxr adapters generate`).
2. Check BEFORE you build: `ctxr catalog check` (add `--stale` for glosses whose note changed) and
   `ctxr doctor`. Zero coverage, a parse error, or a count far below the store's real note count means
   the builder and the base disagree — STOP; a build now writes a broken or empty artifact. Fix the base,
   or hand-add only your entries, matching the committed structure, and say so in the commit message.
3. Build, then read the result back: reported counts against the source (notes vs catalog entries, graph
   nodes vs notes); your new notes present with non-zero links; nothing else lost.
4. Fences: never hand-edit inside a `contexture:<region>` fence — the next build overwrites it. Hand
   edits OUTSIDE a fence (catalog glosses, prose around a generated section) are preserved by every
   build and are the right place for them. A note's own operator-defined fenced region (a ledger, a
   log, any block maintained via `ctxr entry append <note> --region <name>`) is a different concern —
   that append is the sanctioned write into it, never a hand edit.
5. Commits: artifacts under the cache paths never stage. Committed derived files (the catalog) ride
   their own small change AFTER the content lands, path-scoped (`git add <path>`), never swept up with
   `-A` in a checkout other sessions use.
6. Verify the remote, not the claim: after "it's merged", `git fetch origin` and
   `git show origin/__DEFAULT_BRANCH__:<path> | grep -c <marker>` before treating the loop as closed.
