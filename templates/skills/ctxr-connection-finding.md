Traversal of links that already exist. To discover links a note SHOULD have, use `ctxr-connection-proposal`;
to synthesize an entity's current state from its sources, use `ctxr-rollup`.

1. Run `ctxr graph build` to refresh the wikilink graph from the store's current notes, then read the graph
   document it writes at `__GRAPH_DOCUMENT_PATH__` — hub notes by cluster, cross-cluster bridges,
   orphans — for the cluster context the point queries below do not summarize.
2. To find what a note connects to or from, run `ctxr graph query neighbors <path>` (add `--depth` for
   further hops, `--direction in|out|both`, `--type <relation>` to follow one configured relation,
   `--as <context>` to see only what that context can see).
3. To find a path between two notes, run `ctxr graph query path <from> <to>`.
4. To find the most-referenced notes, run `ctxr graph query hubs`; to find unlinked ones,
   `ctxr graph query orphans`; `ctxr graph query clusters` and `ctxr graph query bridges` show the
   cluster structure and the notes that span it.
5. Report what the graph says — it enumerates structure and ranks nothing; judgment about which links
   matter is yours.
