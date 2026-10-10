## Retrieval

Find before you write. contexture builds and maintains the catalog and the wikilink graph; consult them before your own search.

1. **Enter and expand** with `ctxr context gather`. It takes entry selectors — `--section <id>`, `--under <prefix>`, `--seed <path>`, `--entity <name>` — walks the graph out from them (`--hops`, `--type <relation>`), and returns each note with its catalog gloss and hop distance, so you open only what the glosses justify. Start an open conceptual question from a catalog section (`ctxr catalog show --section <id>`).
2. **Structure** — paths, hubs, orphans, clusters, bridges — comes from `ctxr graph query`; read the graph document at `__GRAPH_DOCUMENT_PATH__` for cluster context before writing.
3. **Widen** with your own content matching (e.g. ripgrep) for a literal string or identifier, excluding __EXCLUSION_PATHS__, and feed a hit back in as `--seed`. Captures under `__CAPTURE_ROOT__` are excluded because they are provenance, not notes: to learn whether the store already holds some material, search `__CAPTURE_ROOT__` directly, by content and by the `capture_file` a capture names.

There is no `ctxr search` command: nothing takes a free-text query, and no result carries a relevance score.
