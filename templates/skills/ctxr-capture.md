Capture is how material from outside the store becomes something the store can cite. It ends at the
inbox, not at a note: what the store should know from this material is the next skill's question, and
answering it here is how a capture quietly turns into someone's paraphrase of a source nobody kept.

## 1. Find the material

Work with whatever the harness has actually connected — a tool that can read the source system, a file
on disk, a URL the user handed you. Do not assume any particular one is available, and do not guess at
one: look at what is there, and if nothing can reach the material, say so and ask rather than
reconstructing it from memory or from what the user said about it.

When a source system returns several items and the request named one, confirm which before writing.
Capturing the wrong meeting is not recoverable by a later ingest — it is a record of something that did
not happen.

## 2. Write the record, not your reading of it

A capture is the source's own account, in the source's own words. Copy it through. Do not condense it,
do not reorder it, do not fix its grammar, and do not drop the parts that look redundant — a capture
that has been improved is no longer evidence of anything.

Where the source supplies a summary of its own, keep it, clearly marked as the source's derivation, in
its own section beside the record rather than instead of it. A summary is what a service concluded; the
record is what happened. A store may require, per source type, the section its captures must carry — if
it does, a capture missing that section is refused at ingest, so check the store's configuration before
deciding a summary is enough.

One capture per item. Two meetings in one file cannot be cited separately, deduplicated separately, or
retracted separately.

## 3. Give it an identity

In the capture's frontmatter:

- `source_type` — the source system's own name, lowercased. Use the same value the store already uses
  for that system; a second spelling silently defeats deduplication.
- `source_id` — that source type, then a slash, then the identifier the source system itself uses for
  this item. Prefer an opaque, stable id over a title or a date, which get edited.

Do not write `source_hash` or `ingested`. Ingest assigns both, once, and a capture that arrives
claiming them is treated as already ingested.

Material that is not markdown cannot carry frontmatter, so write a markdown file beside it naming it in
`capture_file`. The two travel together from here on, and the required-section rule looks at the
markdown, not at the bytes.

## 4. Check before you write it into the inbox

If the material may already be in the store, run `ctxr source check <path> --source-id <id>` and read
the verdict before going further. Re-capturing something the store already holds is how one source ends
up cited twice under two identities.

Then write the file into `__INBOX_PATH__`. Nothing else — no note, no edit to an existing note, no
placement decision.

## 5. Hand off

Say what you captured and where it landed, then stop and let `ctxr-ingest-orchestration` take it: what
the store should know after this material, which note it changes, and whether it needs a note at all is
that skill's decision table, and it reads the existing cluster before answering. A capture that has been
filed straight into a note has skipped the only step that asks whether the store needed a new one.
