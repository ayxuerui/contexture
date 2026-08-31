## Retrieval: which leg to use

contexture builds and maintains two retrieval tools ahead of time — consult them first:

- **Catalog** (`ctxr catalog show --section <id>`): a curated, coverage-guaranteed index of every retrievable note, one section per taxonomy layer.
- **Graph** (`ctxr graph query ...`): the wikilink graph between notes — neighbors, shortest path, hubs, orphans, clusters, bridges; `--type <relation>` follows one configured relation.
- **Graph document** (`__GRAPH_DOCUMENT_PATH__`, rebuilt by `ctxr graph build`): hub notes by cluster, cross-cluster bridges, and orphans — read it for cluster context before writing.

For a literal or entity question the catalog and graph do not answer (a specific string, an exact identifier, a phrase),
use your own direct content-matching tool (e.g. grep/ripgrep) against the store, scoped to exclude:

__EXCLUSION_PATHS__

There is no `ctxr search` command. Ranked or semantic search is deferred to a future version — do not look for one.
