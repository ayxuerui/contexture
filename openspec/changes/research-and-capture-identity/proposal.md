## Why

Retiring pkm's duplicated skills turned up three things that every store needs and that contexture did not
ship:

- **A research method.** pkm's `research-assistant` was the only procedure for researching a question against
  outside sources: perspectives, source tiers, a contradiction map, a review before acting. readyrun-brain,
  whose whole job is research passes, had nothing.
- **Identity for material no system identifies.** A PDF or pasted text has no source-system id. pkm hashed it.
  `ctxr-capture` said only "the identifier the source system itself uses".
- **A bare `--source-id` lands in debt form.** `ctxr ingest` writes whatever id it is given, so a bare
  `KAjUF…` instead of `circleback/KAjUF…` defeats deduplication against every correctly prefixed record. pkm
  carried a note warning about it.

Archiving had a gap of the same kind: `ctxr archive` moved one note, so a project folder had to be retired with a
hand-written `git mv`.

## What Changes

- **New owned skill `ctxr-research`.** It is a grounded adaptation of STORM:
  - frame the question from what the store already knows, including connected sources not yet captured;
  - ask one scoping question;
  - pick up to three perspectives plus the basic facts;
  - turn questions into queries;
  - tier the sources;
  - map contradictions, source-bias transfer and over-association;
  - synthesize, review, and land the result through `ctxr-ingest-orchestration` and `ctxr-placement`.

  It is written against whatever web access the harness provides. It names no browser, tunnel or tool, follows a
  store's own documented browser routing when there is one, and stops rather than filling gaps from memory when
  the harness can reach no web source.
- **`ctxr-capture`** names the identity for unidentified material (`pdf/<sha1 of the file>`,
  `manual/<sha1>`), an email's `Message-ID`, a URL compared with the tracking parameters removed, and reading a
  slide deck as images.
- **`ctxr ingest` refuses a `--source-id` that does not begin with `<source-type>/`**, writing nothing.
- **`ctxr archive` accepts a folder, and keeps the source path.** A note or folder lands at its store-relative
  path beneath the archive destination (`projects/Bet` becomes `archives/projects/Bet`) as one tracked rename,
  so an archived item still shows where it lived. The command reports every note outside it that links in, and
  refuses an item already archived. `ctxr-organize-audit` names the command instead of a hand-written `git mv`,
  says to record what happened to every retired item and when, and hands a retired mission priority to
  `ctxr-mission`.

## Non-goals

- **Fetching.** contexture still fetches nothing. The research skill uses the harness's search, fetch and
  browser, and says so when there are none.
- **A source-tier script.** pkm's `source_tier.py` was a domain list. The tiers are stated as rules the agent
  applies (design.md D2).
- **Migrating existing bare ids.** Captures already ingested keep their ids. The refusal applies to new ingests.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: the research skill, the capture skill's identity conventions, and the organize-audit
  skill's retirement practice.
- `context-ingest`: ingest refuses an unprefixed source id.
- `context-organize`: archiving keeps the source path, and a folder archives whole.

## Impact

- `templates/skills/ctxr-research.md` (new), `templates/skills/ctxr-capture.md`,
  `templates/skills/ctxr-organize-audit.md`, `src/core/skills.ts`.
- `src/commands/ingest.ts`, with `SourceIdUnprefixedError` in `src/core/errors.ts`.
- `src/commands/archive.ts`, `src/run.ts`.
- Tests and the README skill table.
- **Downstream:** pkm's `research-assistant` retires once this is released, and pkm needs no archive convention
  document of its own. Its source-bank references become
  notes.
