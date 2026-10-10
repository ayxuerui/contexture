## ADDED Requirements

### Requirement: A guidance document may load on demand
An operator-authored convention document MAY declare, in its frontmatter, a `read_when` field holding a single line that states when an agent should read it. A document declaring a non-empty `read_when` SHALL NOT be inlined into the entry document. Instead, the entry document's guidance index section SHALL list it as one entry naming its title, its `read_when` text, and its store-relative path, in the order the documents are scanned. A document declaring no `read_when` SHALL be inlined exactly as before. The configured mission document SHALL never be listed in the index, because it has its own section. When no document declares `read_when`, the guidance index section SHALL be absent, and regenerating SHALL report no change once it is already absent. This requirement is the only place the `read_when` key is named.

#### Scenario: An on-demand document is indexed, not inlined
- **WHEN** a convention document declaring `read_when: Before a research pass` sits at the configured guidance path and the entry document is regenerated
- **THEN** the guidance index section names that document's title, the text "Before a research pass", and its path, and no part of its body appears in the "Store conventions" section

#### Scenario: A document without the field is still inlined
- **WHEN** a convention document with no `read_when` sits beside an on-demand one and the entry document is regenerated
- **THEN** that document's body is inlined in the "Store conventions" section as before, and it does not appear in the guidance index

#### Scenario: Changing the trigger refreshes the index
- **WHEN** an operator edits an on-demand document's `read_when` and `ctxr update` runs
- **THEN** the guidance index carries the new text, and an immediately repeated update reports nothing changed

#### Scenario: No on-demand documents means no index section
- **WHEN** no convention document declares `read_when` and the entry document is regenerated
- **THEN** `AGENTS.md` carries no guidance index section

### Requirement: The entry document fits the harnesses that read it
`ctxr doctor` SHALL fail when `AGENTS.md` is larger, in bytes, than the smallest effective entry-document read limit among the store's declared harnesses (the per-harness limits the adapters capability defines). The failure SHALL name each harness whose limit is exceeded, the document's size, that harness's limit, and the first generated section the limit falls inside. When no declared harness has an effective limit, the check SHALL pass. Separately, `ctxr lint` SHALL report, as an observation, when `AGENTS.md` exceeds the store's target size, `harness.entry_document_target_bytes`, which SHALL default to a shipped value of 20,480 bytes. The target is a convention key with a shipped default, and a store may lower or raise it.

#### Scenario: A document past a declared harness's limit fails doctor
- **WHEN** a store declares `antigravity`, sets no override, and its `AGENTS.md` is 30,000 bytes with the 24,000th byte inside the "Store conventions" section
- **THEN** `ctxr doctor` fails, naming `antigravity`, a size of 30,000 bytes, a limit of 24,000, and the "Store conventions" section

#### Scenario: Only the harnesses whose limits are exceeded are named
- **WHEN** a store declares both `codex` and `antigravity` and its `AGENTS.md` is 28,000 bytes
- **THEN** `ctxr doctor` fails naming `antigravity` and not `codex`

#### Scenario: A store whose harnesses read everything passes
- **WHEN** a store declares only harnesses with no read limit and its `AGENTS.md` is 100,000 bytes
- **THEN** the read-limit check passes, and `ctxr lint` reports that the document exceeds its target size

#### Scenario: A document over the target but within every limit is an observation
- **WHEN** a store with the default target declares `codex`, and its `AGENTS.md` is 22,000 bytes
- **THEN** `ctxr doctor` passes, and `ctxr lint` reports the size and the 20,480-byte target

#### Scenario: A store sets its own target
- **WHEN** a store's configuration sets `harness.entry_document_target_bytes` to 16,384 and its `AGENTS.md` is 18,000 bytes
- **THEN** `ctxr lint` reports the document against a target of 16,384

### Requirement: contexture's own share of the entry document is held under a ceiling
The contexture-owned prose in the entry document (the fundamentals, retrieval, capture, and placement sections, the shipped baseline, and the guidance index's own framing), rendered for a freshly initialized store on the default configuration, SHALL total no more than a shipped ceiling. This is enforced by an automated test that initializes a store, measures those sections, and fails when the total exceeds the ceiling. The ceiling SHALL only be lowered, never raised, without a change that argues for the increase. Procedure that a shipped skill already carries SHALL NOT be restated in these sections. A section names the skill instead.

#### Scenario: Growing a generated section past the ceiling fails the suite
- **WHEN** a contexture template is edited so that a freshly initialized store's contexture-owned sections exceed the ceiling
- **THEN** the automated test fails, naming the measured total and the ceiling

#### Scenario: A section defers to the skill that carries the procedure
- **WHEN** the capture section of a freshly initialized store's entry document is read
- **THEN** it states where captures go and which source-identity fields a capture must not carry, names the skills that carry the capture and ingest procedure, and does not restate the five verdicts or the ingest walkthrough

## MODIFIED Requirements

### Requirement: Operator conventions are inlined into the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The generated "Store conventions" section of `AGENTS.md` SHALL inline the full body of every convention file present that does not load on demand (governed by *A guidance document may load on demand*). Each inlined body SHALL have its frontmatter stripped, its headings demoted so the shallowest sits directly under the section's own heading, and a provenance line naming its source path. When no convention files exist, the section SHALL state where to add them.

#### Scenario: A convention file's body is inlined on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title and no `read_when` at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions section contains that file's full body under a heading naming its title, with a line naming its source path, and its own headings demoted one level below the section heading

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be inlined, or indexed when they declare when to read them

#### Scenario: Inlining is byte-stable
- **WHEN** the entry document is regenerated against unchanged convention files
- **THEN** the conventions section is byte-identical and regeneration reports no change

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic entry document for the store. It holds the store's fundamentals, its current mission when one is configured, and its every-turn operating conventions inlined, with no harness-specific extras. It also holds an index naming, for every guidance document that loads on demand, when to read it and where it is. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds all of the following without needing to read any other file to learn what exists:
  - the root-resolution rule
  - the frontmatter schema pointer
  - the write-path rule
  - a statement that agent identity, persona, and the agent's conversational recall of the user and of itself belong to its harness while subject-matter knowledge belongs to this store
  - the store's current mission when one is configured
  - the store's every-turn conventions
  - for every on-demand guidance document, its title, when to read it, and its path

#### Scenario: The canonical section names the mission document when configured
- **WHEN** a store's `contexture.yaml` declares `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names that path as a document to load at session start, alongside the root-resolution rule, the frontmatter schema pointer, and the write-path rule — immediately followed by the "Mission" section carrying that document's full inlined body

#### Scenario: No mission pointer when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names no mission document, and regenerating again reports no change

### Requirement: The entry document's inlined content matches its sources
`ctxr doctor` SHALL fail when `AGENTS.md` no longer matches its sources, naming the drifted source. This covers three cases:
- the inlined conventions section no longer matches a convention file's current content;
- the guidance index no longer matches an on-demand document's current title, trigger, or presence;
- the Mission section no longer matches the mission document, for example because it changed after its last rollup-triggered refresh.

The pre-commit hook SHALL refuse a commit that stages a change to a convention file or to the configured mission document while leaving `AGENTS.md` stale relative to that change.

#### Scenario: Doctor detects a drifted convention file
- **WHEN** a convention file is edited directly (not through a commit that also regenerates `AGENTS.md`), whether its inlined body or its on-demand title or trigger changed, and `ctxr doctor` runs
- **THEN** it fails, naming the drifted convention file's path

#### Scenario: Doctor detects a drifted mission document
- **WHEN** the mission document is edited by a means other than `ctxr rollup write` and `ctxr doctor` runs
- **THEN** it fails, naming the mission document's path

#### Scenario: A commit that would leave the entry document stale is refused
- **WHEN** a commit stages a change to a convention file (inlined or on-demand) or the mission document without a corresponding regeneration of `AGENTS.md`
- **THEN** the pre-commit hook refuses the commit and names the file that would drift

#### Scenario: A synchronized store passes
- **WHEN** every convention file and the mission document match what `AGENTS.md` currently inlines or indexes
- **THEN** `ctxr doctor` reports no drift finding

### Requirement: Generated sections render in a fixed order
The entry document's contexture-managed sections SHALL render, on a freshly initialized store, in a fixed order: store fundamentals, mission (when configured), retrieval routing, capture, placement, store conventions, then the guidance index (when any document loads on demand). On an existing store whose managed sections are contiguous (separated only by blank lines), `ctxr update` SHALL reorder them to match. When hand-written content interrupts that contiguity, `ctxr update` SHALL leave the existing section order unchanged rather than reordering around foreign content. It SHALL report this via `ctxr lint` as an observation, not as a `ctxr doctor` failure. `doctor` runs only invariant-severity checks (per store-integrity's own "observation checks never fail a run"), so a non-blocking finding is a `lint` finding by construction, never a `doctor` one.

#### Scenario: A first-time init writes sections in the fixed order
- **WHEN** `ctxr init` runs against a store with no existing `AGENTS.md`
- **THEN** the generated sections appear in the fixed order

#### Scenario: A drifted but contiguous store converges on update
- **WHEN** an existing store's managed sections are in a different order but are separated only by blank lines, and `ctxr update` runs
- **THEN** the sections are reordered to match the fixed order, and hand-written content outside every managed section is preserved unchanged

#### Scenario: Hand-written content between sections blocks reordering
- **WHEN** hand-written content sits between two managed sections and `ctxr update` runs
- **THEN** the existing order is left unchanged, and `ctxr lint` reports the interruption as an observation
