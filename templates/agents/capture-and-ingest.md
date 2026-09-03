## Capturing and ingesting new material

Captures live under `__CAPTURE_ROOT__`, which is excluded from retrieval: nothing in it is a note, and
nothing in it is returned by a search, listed in the catalog, or drawn in the graph. It is tracked in git
all the same — a capture is the provenance behind a note, not scratch space.

To capture something new, write the material into `__INBOX_PATH__` — no CLI command wraps this. It may
already carry these two fields, since whatever fetched it usually knows them:

- `source_type`
- `source_id`

It MUST NOT carry either of these; contexture assigns them once, at ingest, and never before:

- `source_hash`
- `ingested`

Before ingesting, run `ctxr source check <path> --source-id <id>` to get one of five verdicts: `new`,
`already_ingested`, `drift` (same identity, the source's content moved), `alternate_source_match`, or
`multiple_matches` — the last one means stop and resolve the ambiguity yourself rather than guessing which
existing record it is.

Then write, or extend, the note this material informed. Ingest does not create it: deciding what the store
should know is the work, and "a new note" is only one of the answers.

```
ctxr ingest <path> --into <note> --source-type <type> --source-id <id>
```

That stamps the four fields onto the capture, moves it out of the inbox into `__CAPTURE_ROOT__` under the
month it was ingested, and records its path in the note's `sources` list. The note itself carries no source
identity — it is free to be rewritten, merged, or restructured without ever invalidating the frozen hash.
A note may cite as many captures as it was built from.

Material that is not markdown cannot carry frontmatter, so it travels with a markdown sidecar beside it
naming the file in `capture_file`. The hash is taken over that file's bytes, and the two move together.
