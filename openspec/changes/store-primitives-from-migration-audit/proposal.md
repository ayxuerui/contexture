## Why

Auditing the migration target's 52 harness skills against contexture's CLI (see `owned-skills-expansion`, design D1) showed that the store's proven procedures lean on seven operations contexture has no verb for. Each is generic — no operator's vocabulary, taxonomy, or tooling is required to state it — and each is currently done by hand-rolled scripts or by an agent editing files directly, which is exactly the class of "bespoke maintenance" contexture exists to replace. Without them the owned skills have to say "do this manually", and the store's most valuable discipline (session landing, structured appends, dedupe verdicts, leak scanning) stays outside the tool.

## What Changes

- **Session landing.** `ctxr session land` completes an approved session end-to-end (verify the pull request's state, merge with the configured strategy, sync the default branch, remove the worktree) with explicit gates before every external side effect; `session submit` learns `--branch` and `--title`. Retries verify state before acting.
- **Append into a fenced region.** `ctxr entry append <note> --region <name>` inserts a line into a `contexture:<region>` fenced block, creating the block if absent, preserving hand-written content outside it, and returning the region's line count so callers can verify.
- **Dedupe verdicts.** `ctxr source check` distinguishes `duplicate` from `drift` (same identity, different hash), exposes `source stamp` to record identity on an existing note and `source add-alt` to append an alternative source to an already-ingested note, and canonicalizes URL identities (scheme, host case, tracking parameters, trailing slash) before comparison.
- **Typed relation edges.** Wikilinks carry an optional relation from the configured vocabulary (`[[target|rel:name]]` or a frontmatter relations block — the design fixes one); `graph build` records the type; `graph query` filters by it.
- **Leak scan.** `ctxr lint` gains a check that flags content belonging to one context found inside a note visible to another, using the configured context mapping and operator-declared marker patterns; `ctxr check --scan` reports the same for one note.
- **Rollup staleness.** `ctxr rollup stale [--for <entity>]` lists entity notes whose backlinks are newer than the note's own last rollup timestamp.
- **Identity mutation.** `ctxr identity add|replace|remove <file> --section <name>` edits the identity files by section so session capture never rewrites a file wholesale.
- **BREAKING**: N/A — every command is new or additive; `source check`'s existing verdict names are preserved and `drift` is added.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `write-lifecycle`: session landing, submit options, and gated retries.
- `context-store`: fenced-region appends; identity file section edits move under `agent-identity`.
- `context-ingest`: drift verdict, stamp, alternative source, URL canonicalization.
- `context-retrieval`: typed relation edges in the graph.
- `disclosure-policy`: leak scan across the context mapping.
- `context-organize`: rollup staleness as a lint check and query.
- `agent-identity`: section-scoped identity edits.

## Impact

Affected code: `src/commands/session*.ts`, new `src/commands/entry-append.ts`, `src/core/ingest/{dedupe,canonical-url}.ts`, `src/core/graph/{build,query}.ts` + wikilink parser, `src/core/organize/lint.ts` (two new checks), new `src/commands/rollup.ts`, new `src/commands/identity.ts`, `src/core/procedures.ts` (skills reference the new verbs), `openspec/specs/cli-contract` (command surface). Config gains `retrieval.relations` vocabulary (default single group), `disclosure.leak_markers`, `organize.rollup_stale_days`. No schema_version bump — additive.

## Non-goals

- A store-wide activity ledger (the audited vault's append-only log) — git history is the ledger; nothing else is needed.
- A scheduler or cron mode — agents run contexture; contexture never runs itself.
- Retrieval over external indexes (the audited vault's lexical-first/semantic-fallback policy) — a future retrieval adapter, not a primitive.
- Hotness/decay scoring beyond staleness — kept operator-side until a second store asks for it.
- Any harness-specific memory mechanism — identity edits go through files.
