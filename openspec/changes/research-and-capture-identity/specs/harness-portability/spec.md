## ADDED Requirements

### Requirement: contexture ships a research procedure written against any harness's web access
contexture SHALL ship an owned research skill that states a procedure in this order:
1. Frame the question from what the store already knows, including checking connected sources for uncaptured primary material, and ask at most one scoping question.
2. Question the topic from up to three perspectives plus the basic facts, and report a perspective it could not source.
3. Turn questions into search queries.
4. Tier sources (primary, secondary, weak, unreliable), never letting a lower tier carry a decision alone.
5. Map contradictions, source-bias transfer, over-association, and blind spots.
6. Synthesize against the store.
7. Review the result before anyone acts on it.
8. Land it through the ingest-orchestration and placement skills.

The skill SHALL be written against whatever web access the harness provides. It SHALL name no browser, tunnel, port, or tool of a particular harness, SHALL direct the agent to a store's own documented browser routing when one exists, and SHALL direct it to stop and say so when the harness can reach no web source rather than answer from memory.

#### Scenario: The research skill names no harness's browser
- **WHEN** the research skill is rendered for any store
- **THEN** it states that web access differs by harness, follows a store's own browser routing when documented, stops when there is no web access, and contains no harness-specific browser, tunnel, port, or tool name

#### Scenario: The research skill carries its procedure in order
- **WHEN** the research skill is rendered
- **THEN** it carries framing, perspectives, query construction, source tiers, the contradiction map, synthesis, review, and landing through ingest orchestration, in that order

### Requirement: The capture skill names identity for material no system identifies
The capture skill SHALL state that material carrying no source-system identifier takes a content hash as its source id: a file's SHA-1, or the SHA-1 of pasted text. It SHALL state that an email is identified by its `Message-ID`, that a web page is identified by its URL as compared with the store's configured tracking parameters removed, and that the same prefixed form is passed to `ctxr ingest`. It SHALL state that a slide deck is read as rendered pages, not extracted text.

#### Scenario: Capture names the hash convention and the prefixed form
- **WHEN** the capture skill is rendered
- **THEN** it names `pdf/<sha1 of the file>` and `manual/<sha1>`, the email `Message-ID`, the URL compared without tracking parameters, the prefixed `--source-id`, and reading a deck as images

## MODIFIED Requirements

### Requirement: Source and retirement practice ships in the skills
The capture skill SHALL instruct the agent to:
- query connected sources for uncaptured primary material on a topic before a research pass;
- treat several items from one source system covering the same occasion as one source, checked against each other by content rather than string matching, and never counted as corroborating each other;
- record, when a source does not separate speakers, that every attribution built from it is inference.

The ingest-orchestration skill SHALL instruct recording who claimed an unverified quantity, when, and in what setting. The organize-audit skill SHALL state that a unit living as a folder of notes is retired whole with the archive command, which keeps its path beneath the configured archive destination; that every retired note or folder records, in its hub note or a banner at its top, in the past tense, what happened and when it was retired; and that retiring an item the mission names as a priority is followed by the mission skill. The baseline conventions SHALL state that a note's `title:` equals its filename stem. The placement skill SHALL state that a unit carrying supporting notes gets a folder of its own, because the graph clusters notes by their first configured cluster-depth path segments and a common parent would merge their clusters.

#### Scenario: A unit with supporting notes gets its own folder
- **WHEN** the placement skill is rendered for a store whose graph cluster depth is 2
- **THEN** it tells the agent to give a unit with supporting notes its own folder, naming the first 2 path segments as what the graph clusters by

#### Scenario: Capture carries the same-event, speaker, and primary-material rules
- **WHEN** the capture skill is rendered
- **THEN** it names checking connected sources before research, treating same-occasion items as one source, and marking attributions from an unseparated transcript as inference

#### Scenario: Ingest records a claim's provenance
- **WHEN** the ingest-orchestration skill is rendered
- **THEN** it tells the agent to record who claimed an unverified quantity, when, and in what setting

#### Scenario: A folder is retired whole
- **WHEN** the organize-audit skill is rendered for a store whose archive destination is `archives/`
- **THEN** it tells the agent to retire a folder of notes with `ctxr archive <folder>`, landing at `archives/<folder>`

#### Scenario: A retirement is recorded and the mission checked
- **WHEN** the organize-audit skill is rendered
- **THEN** it tells the agent to record, in the past tense, what happened to every retired item and when, and to run the mission skill when the item was a mission priority

#### Scenario: Titles match filename stems
- **WHEN** the baseline conventions are rendered
- **THEN** they state that a note's `title:` equals its filename stem
