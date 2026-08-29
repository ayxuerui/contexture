## D1 — One home directory, two tracking regimes

`.contexture/` is the tool's home. Authored-but-tool-owned content (catalog glosses, identity, procedures) is tracked; derived artifacts live under `.contexture/cache/`, the only default entry in `derived.paths` and therefore the only gitignored part. This replaces "ignore all of `.contexture/`" — the fenced gitignore block now carries `.contexture/cache/`.

## D2 — Identity open-box by reference, not inlining

The generated AGENTS.md identity section lists the identity file paths (from config) with a "load these at session start" instruction. Inlining was rejected: it duplicates content the identity files own (violating the no-duplication rule the harness entry files already follow), and it would put per-session-injected content into a document that is also the retrieval-conventions reference.

## D3 — Skills as generated mirrors of canonical procedures

Same shape as harness entry files: the canonical form is the portable procedure markdown; a skill wrapper is a harness-specific *pointer* (frontmatter for discovery + "read and follow <path>"), regenerated idempotently and byte-stable by `adapters generate`. Tracked, not gitignored — they are tiny, reviewable, and useful to other clones. The adapter interface gains an optional `skills` capability rather than a new adapter kind: skill generation is a facet of harness generation, not an independent lifecycle.

## Risks

- **[Risk] Hidden directories are invisible to some editors (e.g. Obsidian ignores dotfolders).** → Accepted: catalog/identity/procedures are agent- and CLI-facing surfaces, not operator content; the operator's content stays at the root where their editor sees it. This is the point of the change.
- **[Risk] Existing docs/tests assume root-level defaults.** → Updated in this change; config-declared paths everywhere means only defaults move.
