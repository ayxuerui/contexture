## MODIFIED Requirements

### Requirement: Capture is an owned skill over connected sources
contexture SHALL ship `ctxr-capture` as a contexture-owned skill, delivered by `init` and refreshed by `update` like every other owned skill. The skill SHALL carry the procedure for bringing external material into the configured inbox: locate the material among whatever sources the harness has connected rather than assuming a particular one is present; write the source's record into the inbox; stamp the source type and source id while leaving the two fields ingest assigns unset; run the dedupe check when the material may already be in the store; and end by handing off to the ingest-orchestration skill. The skill SHALL NOT instruct the agent to decide what the store should know, which note to write, or where it belongs — those are the ingest-orchestration and placement skills' procedures, and capture ends before them.

The skill's steps MAY name tools contexture does not provide, on the same footing as the submit and land skills naming `git` and `gh`. contexture SHALL NOT ship a client, credential handling, or an adapter kind for any capture source. An opt-in owned skill MAY drive a capture source's own command-line tool, which holds that source's credential, when the skill reads and stores no credential itself (per *The Circleback skill routes meetings by tag without handling a credential*).

#### Scenario: The capture skill is delivered and refreshed like every owned skill
- **WHEN** `init` writes a store, and a later `update` runs after the shipped copy has drifted
- **THEN** a full copy of the capture skill sits at the configured skills path in the skill layout marked as managed, and update rewrites the drifted copy to the installed version

#### Scenario: Capture ends at the handoff, not at a note
- **WHEN** the rendered capture skill's final step is read
- **THEN** it hands off to the ingest-orchestration skill, and no step of it instructs creating, expanding, merging, or restructuring a note

## ADDED Requirements

### Requirement: An opt-in owned skill ships only to a store that declares its configuration block
contexture SHALL be able to ship an owned skill that a store receives only by opting in. Such a skill SHALL be enabled by an optional top-level block in `contexture.yaml` that has no shipped default, so a store that never declares the block never carries the key and never receives the skill. While the block is present, `ctxr init` and `ctxr update` SHALL write and refresh the skill exactly like every other owned skill. When the block is removed, the skill SHALL no longer be shipped to that store, and the next `ctxr update` SHALL remove its managed directory, as it does for a skill the package stopped shipping. An opt-in skill's supporting files MAY be rendered from the store's configuration, for a runner that cannot read `contexture.yaml` itself.

#### Scenario: A store without the block gets no opt-in skill
- **WHEN** a store's `contexture.yaml` declares no `circleback` block and `ctxr update` runs
- **THEN** no `ctxr-circleback` directory is written, and the rendered configuration carries no `circleback` key

#### Scenario: Opting out removes the skill
- **WHEN** a store that carried `ctxr-circleback` removes its `circleback` block and `ctxr update` runs
- **THEN** the managed `ctxr-circleback` directory is removed with every file in it, and an immediately repeated update reports nothing changed

### Requirement: The Circleback skill routes meetings by tag without handling a credential
contexture SHALL ship `ctxr-circleback` as an opt-in owned skill, enabled by a `circleback` block naming this store's tag, optionally the tags that route a meeting to other stores, and optionally the tag that declines a meeting (absent means `no-capture`). The skill SHALL carry a runner, invoked with `node` and depending on nothing outside the Node standard library, and a settings file rendered from that block. The runner SHALL drive Circleback's own command-line tool, `git` and `gh`, and SHALL NOT read, write or store any credential.

The runner SHALL read the meetings of a fixed lookback window with their tags, and SHALL treat a meeting as owed by this store when it carries this store's tag, carries neither the decline tag nor another store's tag, is absent from the store's default branch and from every open pull request, and is still readable in full. For owed meetings it SHALL prepare a review-branch worktree at a fixed path, clearing what an earlier run left there, and SHALL write each one's mechanical capture into the configured inbox there: the source type and id, metadata, attendees, the source's action items and summary marked as its own derivation, and the transcript verbatim under the store's required capture section for the source type, with trailing whitespace removed and the recording URL never written. It SHALL print a report naming what is owed, and separately what is locked, untagged, tagged for more than one store, and recently declined. A failure SHALL be reported as such and never as an empty list.

The skill SHALL leave to the agent only the judgment and the publishing: a speaker caveat where labels cannot be trusted, the dedupe check, the commit, and the pull request. It SHALL state that the agent never edits the transcript or the source's summary, never merges, and never ingests.

#### Scenario: Only owed meetings are rendered
- **WHEN** the runner sees meetings that are tagged for this store and absent, tagged for this store and present, tagged for this store and locked, untagged, tagged for this store and another, declined, and tagged only for another store
- **THEN** only the first is rendered into the inbox, and each of the others is counted as present or listed under its own report section

#### Scenario: A capture carries the record and no credential
- **WHEN** an owed meeting is rendered
- **THEN** the capture carries `source_type: circleback` and its prefixed source id, the transcript under the store's required section, no trailing whitespace, and not the recording URL

#### Scenario: A repeated run does not collide with the last
- **WHEN** the runner runs twice with the same meetings owed
- **THEN** the second run reuses the fixed worktree path and renders the same captures without failing
