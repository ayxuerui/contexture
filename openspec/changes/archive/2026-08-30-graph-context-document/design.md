## D1 — The document is a second render of the same build, not a second build

`graph build` computes one `GraphBuildResult` (now with `cluster` per node and `type` per edge) and writes two artifacts from it: `graph.json` for tools and `graph.md` for readers. A single derivation means the two can never disagree, and the document's byte-stability follows from the build's determinism — which is why it carries counts but no date. Both live under the cache path; the AGENTS.md retrieval section names the document's path so an agent finds it without knowing the layout.

## D2 — Clusters are positional, never nominal

Cluster = the first `retrieval.graph.cluster_depth` directory segments of the note's path (default 2), joined with `/`. Under a layered taxonomy that yields "layer/location" — exactly the unit the placement procedure reasons about — and under a zero-layer store it yields the first two folders, or the root cluster for root notes. No layer name enters the rule, so `single-source-literals` stays clean and a custom taxonomy needs no configuration.

## D3 — Typed edges come from headings, not frontmatter

The earlier design (primitives D4) chose a `relations:` frontmatter block. The audited store already encodes relations as section headings whose names are the vocabulary, and its notes were written that way by hand for months; a frontmatter block would have required migrating every note or maintaining two readers. Heading extraction is lenient by construction: heading text is compared after trimming and stripping a trailing colon, case-insensitively; a section ends at the next heading of the same or higher level; links outside any relation section are `link`. The vocabulary lives in `retrieval.relations` (default `[]`), and the connection-proposal skill reads it from there instead of from prose.

## D4 — Bridges count clusters, not links

A bridge score is the number of *distinct other clusters* a note links into — not the number of cross-cluster links — so one hub that links ten times into one neighbor is not a bridge, and a note that touches four clusters once each is. Ties break by path for determinism. `bridge_top` and `hub_top` bound the document's size; `orphan_exempt_clusters` lets an operator keep a deliberately unlinked cluster (a journal, a scratch area) out of the orphan list without touching the orphan lint check.

## D5 — Document sections and their order

1. `# Graph` — counts: notes, links, typed links, clusters, bridges, orphans.
2. `## Hub notes by cluster` — one `### <cluster>` table per cluster (`| Note | Backlinks |`, top `hub_top` with backlinks > 0; clusters with none are omitted).
3. `## Cross-cluster bridges` — `- [[Note]] — <cluster> ⇔ <cluster> … (n clusters)`, top `bridge_top`.
4. `## Orphans` — `- [[Note]] — <cluster>` for backlinks = 0, exempt clusters excluded.

Links are written as `[[stem]]` so the document is navigable inside the store; the stem is what wikilinks resolve on.

## Risks

- **[Risk] A store with thousands of notes yields a document too long to read.** → `hub_top`/`bridge_top` cap every section except orphans, and the orphan section is exactly the lint finding list — a long one is a real signal.
- **[Risk] A relation name collides with an ordinary heading ("Similar" as a prose heading).** → Only headings matching the configured vocabulary are typed, and the vocabulary is opt-in; an operator who sees a false typed edge renames the heading or narrows the vocabulary.
- **[Risk] Cluster depth 2 splits a flat store into one cluster per note.** → Root notes form one cluster; a store whose notes live in one folder gets one cluster and an empty bridge section, which is accurate.
