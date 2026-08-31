## Capturing and ingesting new material

To capture something new, write a plain markdown file directly into `__INBOX_PATH__` —
no CLI command wraps this. That file MUST NOT contain any of these frontmatter fields; contexture assigns
them once, at ingest, and never before:

- `source_type`
- `source_id`
- `source_hash`
- `ingested`

Before ingesting, run `ctxr source check <path> --source-id <id>` to get one of four verdicts:
`new`, `already_ingested`, `alternate_source_match`, or `multiple_matches` — the last one means stop and
resolve the ambiguity yourself rather than guessing which existing note it is.

To ingest, run `ctxr ingest <path> --source-type <type> --source-id <id>`. It stamps the four fields
above onto the file in place and rebuilds the catalog, so the result already has a catalog entry.
