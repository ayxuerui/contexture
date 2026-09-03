## Context

See proposal.md — Why. The constraints that shape the approach:

- `ctxr ingest` stamps identity in place (`src/commands/ingest.ts:70`); the capture and the note are one file, so the store retains nothing to attribute a note to.
- Dedupe's index is `listNotes` (`src/commands/source-check.ts:50`), which honours `retrieval.exclude_paths` (`src/core/notes/list.ts:59-70`). Any design that excludes the capture tier must give dedupe a different index in the same change, or dedupe silently sees nothing.
- `listNotes` walks `.md` only (`src/core/notes/list.ts:96`). Binaries were never notes; the extension filter, not the exclusion, is what has always kept them out.
- `~/workspace/pkm` already runs this layout by hand and reimplements dedupe in Python to compensate. It is the reference for what the shipped default should be, and the store whose existing paths this design should not churn.

## Goals / Non-Goals

**Goals:**

- One retained home for what arrived, carrying the identity, so every row of the ingest decision table records provenance rather than only the "create a new note" row.
- No store loses dedupe coverage at migration.
- No new retrieval behaviour: the capture tier is defined by an exclusion, which is the absence of one.

**Non-Goals:**

- An attachment model for images embedded in note bodies (proposal.md — Non-goals).
- Reconstructing captures for notes ingested before this change.
- Changing the five `source check` verdicts or the two-stage evaluation order.

## Decisions

**D1 — Identity lives on the retained capture, not on the note.** The alternative that keeps ingest in place is a multi-source frontmatter list on the note, each entry carrying its own id and hash. It fails at stage 2 of dedupe: the recorded hash would describe content the store discarded, so `alternate_source_match` would compare a live candidate's body hash against a hash of material no longer present anywhere, and `drift` could never be re-derived. Retaining the capture is what makes the content-hash stage mean something. It also removes the awkwardness the current spec had to legislate around — an inbox file being "mistaken for a duplicate of the note it produced" — because the note carries no identity to collide with.

**D2 — Dedupe indexes the filesystem, not a built artifact.** The index becomes every capture under the capture root plus every note still carrying identity fields from before this change. Implement by reusing `walk` and `excludedPrefixesFor` in `src/core/notes/list.ts` with the capture root as an inclusion rather than an exclusion — one walker, two callers, so the two can never disagree about what a path means. Rejected: a generated index under `.contexture/cache/`. Dedupe is a correctness gate, and a derived index can be stale exactly when it matters; `doctor`'s `derived_artifacts.stale` reports staleness after the fact, which is the failure mode `graph-query` already demonstrates. At the scale contexture targets, a walk is what every command already does.

**D3 — The ledger is partitioned by ingest month, `YYYYMM`, append-only.** Rejected: mirroring the knowledge tier (`raw/resources/topic/x.md`) — one capture can feed several notes, and archiving a note would strand its capture; and a flat content-addressed tree — unbrowsable by a human at the exact moment a human is browsing it, which is when something looks wrong. `YYYYMM` rather than `YYYY-MM` because pkm already uses it and nothing parses the segment, so the only effect of choosing otherwise is a rename in the one store already living this way. Ingest creates the month directory lazily; init does not pre-create months.

**D4 — Binaries live in the dated directory beside their markdown siblings, with no separate assets directory.** A capture is one arrival: the Thrive deck, its memo, and any markdown captured with them belong together. Splitting on file extension would file one arrival in two places and buys nothing, since `listNotes` already ignores non-markdown. (pkm's `raw/assets/` is a different population — 60 of its 69 files are `Pasted image *.png` referenced from note bodies — and this design does not adopt it.)

**D5 — A binary capture's identity rides a markdown sidecar; hashing gains a bytes variant.** `contentHash` strips frontmatter then canonicalizes text (`src/core/content/canonicalize.ts:20-32`), which is meaningless over bytes. Add `contentHashOfBytes` beside it in the same module, so the "single shared primitive" requirement is extended rather than bypassed. Rejected: an external manifest listing binary hashes — a second source of truth that can disagree with the tree.

**D6 — A note cites captures through frontmatter paths, not body wikilinks.** A wikilink into an excluded tier resolves to no note, so the link checker would report every sourced note as carrying a broken link (`organize.dangling_link`, reason `missing`). Frontmatter also keeps provenance out of the prose, where it would be rewritten by the synthesis the note exists to hold.

**D7 — Two config keys, and the inbox must sit under the capture root.** `ingest.capture_root` (default `raw/`) and `ingest.inbox_path` (default `raw/inbox/`). Deriving the root as the inbox's parent is tempting and wrong: a store still on `inbox/` would derive the store root, and excluding the store root would empty the note list. Requiring the inbox to nest under the root — validated in the schema — is what lets one prefix serve both the retrieval exclusion and the path gate.

**D8 — `--into` is required; ingest never creates a note.** Making it optional, with the capture becoming a note when omitted, would reinstate exactly the default the ingest-orchestration skill says is wrong, and make behaviour depend on a flag's absence. Requiring it gives one code path and matches the skill's own order: read the cluster, decide, write the note, then register the source against it.

**D9 — Schema 8 → 9, propagated by a migration modelled on `archive-destination-from-taxonomy`.** That migration already establishes the house pattern: adopt the new shipped default only where the value still sat at the old shipped default, preserve an operator-chosen value verbatim, and move the directory when one exists. Reuse it rather than inventing a second convention.

## Risks / Trade-offs

- **An operator-customized `inbox_path` cannot always satisfy D7's nesting rule** → The migration sets `capture_root` to the inbox's parent when the inbox is nested at least one directory deep. When it is not (a top-level `inbox/`, which is the old shipped default and therefore already handled, or any other root-level directory the operator chose), the migration moves a default-valued inbox to `raw/inbox/` and, for a non-default root-level value, refuses before writing anything and names the choice for the operator. Stopping rather than guessing matches how `source check` handles `multiple_matches`.
- **Retained captures grow the repository, including binaries** → This is the intended cost of provenance, and it is the cost pkm already pays. It is not new storage: the same bytes were previously committed as the note. Nothing in the design forbids a store from pruning old months by hand; the ledger is ordinary tracked files.
- **`--into` becoming required breaks every existing ingest invocation** → It is declared BREAKING in the proposal, and the shipped prose that teaches the old form (`templates/agents/capture-and-ingest.md`, `templates/skills/ctxr-ingest-orchestration.md`, `README.md`) is rewritten in the same change, so no shipped instruction survives pointing at the old signature.
- **Legacy note-borne identity is a second shape dedupe must read indefinitely** → Accepted deliberately: the alternative is fabricating capture files for material the store no longer has. The union index is a handful of lines and is covered by its own scenario, so the compatibility path is tested rather than assumed.
- **A capture in the inbox that a pipeline pre-stamped with a hash is now refused** → Correct behaviour, and detectable: `ctxr lint` reports the file as awaiting ingest, and ingest names it on refusal.

## Migration Plan

1. `ctxr migrate --dry-run` enumerates: `ingest.capture_root` added; `ingest.inbox_path` adopted to `raw/inbox/` where it still held `inbox/`; the inbox directory renamed when it exists; `raw/` appended to `retrieval.exclude_paths` when absent.
2. The directory move uses git's rename so history follows the captures.
3. Notes are not touched. Identity fields already on notes stay where they are and keep working as dedupe records.
4. Rollback is reverting the migration commit: the change is a config edit plus a rename, and no capture is ever deleted.

## Open Questions

- Whether `ctxr lint` should age the inbox observation — report only material older than a configured window, the way `rollup_stale_days` bounds rollup staleness — rather than reporting everything present. Deferrable: it narrows an observation that already exists, changes no requirement here, and can be added once there is evidence about how long material actually sits.
