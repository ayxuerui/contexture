## Why

`ctxr ingest` stamps the four identity fields in place (`src/commands/ingest.ts:70`) — the captured file *becomes* the note, and nothing survives as provenance. That works for exactly one branch of the ingest decision table, and it is why the other branches record nothing at all. `templates/skills/ctxr-ingest-orchestration.md` calls ingest "synthesis, not filing" and says "create a new note" is "one option among several, never the default" — then routes expand / merge / restructure / add-a-section to "ordinary edits." Those edits write no identity anywhere, so `source check` against the same source returns `new` and the material stays re-ingestible forever. The two-stage dedupe covers only the branch the skill tells an agent not to default to.

The gap cannot be closed on the note. A note carries one `source_id`, and `source_alt_ids` means the same content at a different identity. A note synthesized from three sources has nowhere to record three.

Separately, the inbox is deliberately retrievable (`src/config/defaults.ts:103`: "a normal, retrievable directory, not an exclusion"). Unreviewed captures therefore become notes — catalog entries under `uncategorized`, graph nodes, gloss-rot candidates — in a store that positions itself on reviewed knowledge.

Both follow from one missing distinction: **what arrived** and **what you wrote** are the same file. `~/workspace/pkm` already separates them by hand — `inbox_path: raw/inbox/`, `raw/` excluded from retrieval, ingested captures retained under `raw/202604…202608/` with their PDFs beside them — and reimplements dedupe in its own scripts to compensate.

## What Changes

- A **capture tier** joins the taxonomy layers as a first-class store area: `raw/`, holding `raw/inbox/` (arrived, not yet ingested) and one dated directory per ingest month (retained captures, markdown and binaries alike). It is seeded into `retrieval.exclude_paths`, so nothing in it is a note, takes a catalog entry, enters the graph, or answers a retrieval query. It is tracked in git — retained provenance, never derived output.
- **Source identity moves from the note to the capture.** `ctxr ingest <capture> --into <note>` stamps source-type, source-id, source-hash and ingested date onto the capture, moves it from the inbox into the dated directory, and records the capture's path in the destination note's `sources` list. The destination may be a new note or one that already exists, so expand / merge / restructure record provenance on the same footing as create.
- **A note may cite many captures.** `sources` is a list of capture paths in the note's frontmatter, not a wikilink in its body — a wikilink into an excluded tier resolves to nothing and would report every sourced note as having a broken link.
- **Dedupe reads the capture tier.** `ctxr source check` indexes ledger records plus the identity fields still carried by notes ingested before this change, rather than `listNotes` alone (`src/commands/source-check.ts:50`), which honours `retrieval.exclude_paths` and would otherwise see nothing at all once `raw/` is excluded. The five verdicts are unchanged.
- **A binary capture carries its identity in a markdown sidecar** beside it in the same dated directory, hashed over its bytes. A PDF cannot hold frontmatter, and `contentHash` canonicalizes text after stripping frontmatter (`src/core/content/canonicalize.ts:20-32`), so the "single shared primitive" requirement gains a bytes variant rather than being bypassed.
- `ctxr source stamp` and `ctxr source add-alt` operate on a capture rather than a note, matching where identity now lives.
- `ctxr lint`'s uningested-inbox observation is rewritten against the filesystem. It currently lists notes under the inbox prefix and filters for missing identity (`src/core/checks/organize-checks.ts:64-86`); once captures are not notes, `listNotes` skips them and the check would pass on everything.
- `ctxr init` creates `raw/inbox/` and seeds the new configuration. It creates taxonomy layer directories today (`src/commands/init.ts:349-353`) but has never created the inbox, which is why `~/workspace/readyrun-context` has no `inbox/` while declaring one.
- **BREAKING**: `ingest.inbox_path`'s shipped default moves from `inbox/` to `raw/inbox/`, and `ingest.capture_root` is added, defaulting to `raw/`. Two keys with one job each: where un-ingested material waits, and the root of the retained ledger. Schema 8 → 9. The migration adopts the new inbox default and moves the directory only where the value still sat at the shipped default, preserving an operator-customized value verbatim, on the precedent set by `src/core/migrations/archive-destination-from-taxonomy.ts`.
- **BREAKING**: the write-path gate sanctions the capture root rather than the inbox path (`src/core/write-lifecycle/path-gate.ts:88-95`). Without this, a store that declares `write_lifecycle.writable_paths` would refuse the write that ingest itself makes into the dated directory.

## Non-goals

- **Reconstructing captures for already-ingested notes.** A consumed capture cannot be recovered, so notes ingested before this change keep their identity fields and stay valid dedupe records; the index reads both shapes. No store loses dedupe coverage at migration, and none gains a fabricated provenance file.
- **A separate directory for binary captures.** Binaries live in the dated directory beside their markdown siblings, as `raw/202608/Thrive Holdings Overview.pdf` already does in pkm. `listNotes` only walks `.md` (`src/core/notes/list.ts:96`), so the extension filter — not the exclusion — is what already keeps binaries out of every note-based subsystem. Splitting on extension would file one arrival in two places.
- **Embedded attachments.** An image displayed inside a note's body is a knowledge-tier display dependency, not provenance. contexture has no attachment concept today and this change does not add one. (pkm's `raw/assets/` is that population — 60 of its 69 files are `Pasted image *.png` referenced from note bodies — and it sits under `raw/` by an Obsidian default, not by design.)
- **Any change to retrieval itself.** No ranker, no new leg, no change to how the catalog or graph works. The capture tier is excluded from retrieval, which is the absence of a retrieval behaviour, not a new one.
- **Migrating the stores on this machine.** `~/workspace/pkm` and `~/workspace/readyrun-context` each run `ctxr migrate` in their own repos, as their own changes.

## Capabilities

### New Capabilities

_None._ The capture tier is what `context-ingest` already governs — how material enters the store without becoming a duplicate — not a second concept.

### Modified Capabilities

- `context-ingest`: identity is assigned to a retained capture rather than to the note it produced; a note cites many captures; the dedupe index is the capture tier plus legacy note-borne identity; canonicalization gains a bytes variant for binary captures.
- `context-organize`: the uningested-inbox observation is defined over files in the inbox directory, not over notes missing identity fields.
- `store-lifecycle`: `init` creates the capture tier and seeds its exclusion from retrieval.
- `write-lifecycle`: the sanctioned-location rule covers the capture root, not only the inbox.

## Impact

- **Config**: `ingest.capture_root` added, `ingest.inbox_path` default changed, `raw/` seeded into `retrieval.exclude_paths`; `SUPPORTED_SCHEMA_VERSION` 8 → 9 (`src/config/schema.ts:40`), `src/config/defaults.ts`, one new migration registered in `src/core/migrations/registry.ts:20`.
- **CLI**: `ctxr ingest` gains a required `--into`; `ctxr source stamp` and `ctxr source add-alt` retarget from note to capture.
- **Code**: `src/commands/{ingest,source-check,source-stamp,source-add-alt,init}.ts`, `src/core/ingest/model.ts`, `src/core/notes/list.ts`, `src/core/content/canonicalize.ts`, `src/core/checks/organize-checks.ts`, `src/core/write-lifecycle/path-gate.ts`.
- **Shipped prose**: `templates/agents/capture-and-ingest.md`, `templates/skills/ctxr-ingest-orchestration.md`, `README.md`.
