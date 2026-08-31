## Why

`ctxr graph build` derives the graph but exposes it only as `graph.json` plus point queries. The migration target's own graph tooling — which contexture was supposed to replace — also renders a **human-readable graph document** (hub notes by cluster, cross-cluster bridges, orphans) and records **typed edges** read from the relation sections notes already carry. Agents and the ingest procedure read that document for cluster context before writing; a nightly job rebuilds it; the store's harness test invokes it. Because contexture had none of this, the vault had to keep its own graph builder alongside contexture's — two derivations of the same structure, drifting. The decision: contexture covers it entirely.

## What Changes

- `ctxr graph build` SHALL also render a human-readable graph document next to the graph artifact (both derived, under the cache path, never committed): counts, hub notes by cluster, cross-cluster bridges, and orphans by cluster. Byte-stable across runs over an unchanged store — no timestamps.
- Every node gains a **cluster**, derived from its path by a configured depth (default: the first two directory segments; a note shallower than that uses what it has; root notes form the root cluster). No layer name is involved — the rule is positional.
- **Typed edges** from relation sections: a wikilink inside a section whose heading text matches a configured relation name (`retrieval.relations`, case-insensitive, trailing colon ignored; the section ends at the next heading of the same or higher level) is recorded with that type; every other wikilink stays `link`. An empty vocabulary (the default) records no typed edges, so existing stores are unchanged.
- New queries: `graph query clusters` (clusters with note counts), `graph query bridges [--top n]` (notes linking into the most other clusters), and `--type <name>` on `graph query neighbors`. All honor `--as <context>` through the existing pre-filter.
- The owned skills follow: `ctxr-connection-proposal` groups by `retrieval.relations`; `ctxr-connection-finding` and `ctxr-ingest-orchestration` read the graph document for cluster context; AGENTS.md's retrieval section names its path.
- **BREAKING**: N/A — additive config with empty/positional defaults; `graph.json` gains fields, loses none.

## Capabilities

### Modified Capabilities

- `context-retrieval`: the graph leg renders a human-readable document, clusters its nodes, records typed edges from relation sections, and answers cluster and bridge queries.
- `harness-portability`: the connection and ingest skills consume the configured relation vocabulary and the graph document.

## Impact

Affected code: `src/core/graph/model.ts` (cluster on nodes, edge types, section-aware link extraction), new `src/core/graph/document.ts` (renderer), `src/core/graph/persist.ts` (document path), `src/core/graph/query.ts` (clusters, bridges, type filter), `src/commands/graph-build.ts`, `src/commands/graph-query.ts` + `src/run.ts`, `src/config/schema.ts` (`retrieval.relations`, `retrieval.graph.{cluster_depth,hub_top,bridge_top,orphan_exempt_clusters}`), `src/core/agents-doc.ts` (retrieval section), `src/core/procedures.ts` (three skills), `openspec/specs/cli-contract`. Supersedes the typed-relations item of `store-primitives-from-migration-audit`, which is trimmed accordingly.

## Non-goals

- Audience registries and `whois`-style membership resolution — the venture-namespaced audience model is still the v1 cut from `bootstrap-contexture-core`; `ctxr check` already answers the disclosure question the registries fed.
- Hotness or decay scoring — a ranking; the graph leg enumerates and ranks nothing by design (retrieval v1 has no ranker).
- Cluster rules beyond path depth (e.g. collapsing one layer's sub-folders into a single cluster) — an operator preference expressible later as config if a second store asks; positional depth covers the audited store.
- Committing the graph document — it is derived; `staged.path_allowlist` already refuses cache paths.
