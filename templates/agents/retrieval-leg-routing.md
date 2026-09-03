## Retrieval: one pass, three steps

Retrieval is a single pass — **enter**, **expand**, **widen** — not three tools to choose between.
contexture builds and maintains the first two ahead of time; the third is yours.

**1. Enter.** Name where to start, positionally or relationally:

- `--section <id>` — every note a catalog section lists (`ctxr catalog show --section <id>` reads one directly)
- `--under <prefix>` — every retrievable note under a path prefix
- `--seed <path>` — a note you already hold, including one your own search just found
- `--entity <name>` — every note linking to a concept

**2. Expand.** `ctxr context gather` takes those selectors and walks the wikilink graph out from them,
returning each reachable note with its catalog gloss, its hop distance, and labels saying why it is
there — so you can triage the set without opening a single file, then read only what the glosses
justify:

```
ctxr context gather --section <id> --hops 1
ctxr context gather --seed <path> --hops 2 --type <relation>
```

Results are ordered: live material before demoted (archived) material, nearer hops before farther,
then by how the note was reached, then by path. `no_gloss` on a result means the catalog has no
description for that note yet — the pass found it structurally, not by what it says.

For structure on its own — shortest path, hubs, orphans, clusters, bridges — query the graph directly
with `ctxr graph query ...`, and read the graph document at `__GRAPH_DOCUMENT_PATH__` (rebuilt by
`ctxr graph build`) for cluster context before writing.

**3. Widen.** For a literal or entity question the first two steps do not answer — a specific string,
an exact identifier, a phrase — use your own content-matching tool (e.g. grep/ripgrep) against the
store, scoped to exclude:

__EXCLUSION_PATHS__

Feed anything it finds back in as `--seed` to pick the pass up again from there.

There is no `ctxr search` command. Nothing here takes a free-text query, and no result carries a
relevance score. Ranked or semantic search is deferred to a future version — do not look for one.
