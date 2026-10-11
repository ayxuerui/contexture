## ADDED Requirements

### Requirement: The shipped skills carry the operating guidance every store would otherwise restate
Guidance that holds for any store SHALL ship in contexture's owned skills and generated sections, not be left to each store's conventions:

- **The submit skill** SHALL name the routes a pull request takes and instruct the agent to state which one it took and why:
  - a session pull request (the session's work plus its approved capture);
  - an own pull request (a new skill, a structural or entry-document change, a large refactor);
  - a housekeeping pull request (batched small appends, never folded into unrelated work).

  It SHALL instruct the agent, during its re-scan, to check for stale rollups on the entities the session touched and to offer the rollup skill without running it unasked. It SHALL state that the pull-request body answers why, what changed, the route, verification, and follow-ups.
- **The second-opinion skill** SHALL state that a critique is required before implementing a change that is architectural, irreversible, or touches a confidentiality boundary, run before the work rather than after it. It SHALL state that the verdict lands in the pull-request body, which with its commit is the decision record, with no separate governance step.
- **The derived-artifacts skill** SHALL state:
  - that a flagged gloss is confirmed by reviewing it and stripping its frozen hash marker once, so the next catalog build stamps a fresh one, and that editing the gloss alone does not clear the finding;
  - that the graph is a per-checkout cache built at the point of use when `ctxr doctor` reports it stale, never on a schedule.
- **The entry document's retrieval section** SHALL state what to do when a literal search finds nothing: use the vocabulary the note would use, expand acronyms, and walk the graph from the nearest note found.

#### Scenario: Submit names its routes and the body's questions
- **WHEN** the submit skill is rendered for any store
- **THEN** it names the session, own, and housekeeping routes, tells the agent to state its route, and names why, what changed, route, verification, and follow-ups as the questions the body answers

#### Scenario: Submit checks rollups without running them
- **WHEN** the submit skill's re-scan step is read
- **THEN** it instructs `ctxr rollup stale` for the entities the session touched and offering `ctxr-rollup`, and forbids running a rollup unasked

#### Scenario: A critique is required before an irreversible change
- **WHEN** the second-opinion skill is rendered
- **THEN** it states that a critique is required before an architectural, irreversible, or confidentiality-boundary change and that the verdict lands in the pull-request body

#### Scenario: Confirming a stale gloss is documented
- **WHEN** the derived-artifacts skill is rendered
- **THEN** it states that a flagged gloss is confirmed by stripping its hash marker once and rebuilding, that editing the gloss alone does not clear the finding, and that the graph is built at the point of use rather than on a schedule

#### Scenario: Retrieval names its fallback for a search that finds nothing
- **WHEN** the entry document's retrieval section is generated
- **THEN** it tells the agent to retry with the note's own vocabulary, expand acronyms, and walk the graph from the nearest note found

### Requirement: The baseline conventions carry the every-turn rules of any store
The shipped baseline conventions, inlined into every store's entry document, SHALL state:
- that notes are written in outliner bullets rather than prose paragraphs unless the operator asks otherwise;
- that notes link liberally with wikilinks, and that creating a note includes suggesting links to existing notes;
- that a note's existing content is extended rather than overwritten unless a rewrite is asked for;
- the task format: a checkbox with a dated parenthetical for added, due, and done, and a marker for in progress;
- that credentials and full card or account numbers never enter the store, only their last four digits;
- that scratch and intermediate files go in the store's configured scratch path, `harness.scratch_path` (a convention key defaulting to `/tmp/`), never into the store or the home directory;
- that notes carry no access control, so sensitive material is placed deliberately and marked in the note when it must not be quoted onward.

A store's house conventions MAY state a different rule, and the more specific rule applies.

#### Scenario: The baseline states the every-turn rules
- **WHEN** the entry document is generated for a store on the default configuration
- **THEN** its baseline conventions state the outliner, wikilink, preserve-content, task-format, last-four-digits, scratch-path, and no-access-control rules

#### Scenario: The scratch path follows configuration
- **WHEN** a store sets `harness.scratch_path` to `/var/tmp/ctx/` and the entry document is regenerated
- **THEN** the baseline names `/var/tmp/ctx/` as where scratch files go

### Requirement: A store keeps an append-only log
A store SHALL have a log document at `organize.log_path`, a convention key defaulting to `log.md` at the store root. The log SHALL be excluded from every retrieval leg. The baseline conventions SHALL state its entry form, `## [YYYY-MM-DD] <kind> | <title>` followed by short bullets, and that it is appended to and never rewritten. They SHALL also state that, at session start, when the log's most recent `lint` entry is more than seven days old or absent, the agent suggests a lint pass. The ingest-orchestration skill SHALL instruct appending an `ingest` entry after an ingest, and the organize-audit skill SHALL instruct appending a `lint` entry after a lint pass.

#### Scenario: The log is not a note
- **WHEN** a store on the default configuration has a `log.md` at its root
- **THEN** no retrieval leg returns it and the catalog takes no entry for it

#### Scenario: The skills append to the log
- **WHEN** the ingest-orchestration and organize-audit skills are rendered
- **THEN** each instructs appending an entry of the stated form, of kind `ingest` and `lint` respectively, to the configured log path

#### Scenario: A stale lint is suggested at session start
- **WHEN** the baseline conventions are read
- **THEN** they tell the agent to suggest a lint pass when the log's last `lint` entry is more than seven days old or missing

### Requirement: Capture and submit carry their store-independent practice
The capture skill SHALL state that a capture keeps the durable mechanic of perishable material (a promotion, a price), not its momentary state, and that a file a note links to or displays lives under the capture root's `assets/` directory. The submit skill SHALL state that `gh` authenticates from its own credential file, so a token is never exported or interpolated and the origin's URL is never rewritten. It SHALL also give a default branch-name form, `<prefix>/<slug>` with prefixes `skill/`, `feat/`, `project/`, `notes/`, `chore/`, `refactor/`, and `fix/`.

#### Scenario: Capture names perishable state and attachments
- **WHEN** the capture skill is rendered for a store whose capture root is `raw/`
- **THEN** it tells the agent to keep a perishable item's durable mechanic, and names `raw/assets/` for files a note links to or displays

#### Scenario: Submit names the credential practice and branch form
- **WHEN** the submit skill is rendered
- **THEN** it forbids exporting a `gh` token or rewriting the origin, and gives the `<prefix>/<slug>` branch form with its default prefixes
