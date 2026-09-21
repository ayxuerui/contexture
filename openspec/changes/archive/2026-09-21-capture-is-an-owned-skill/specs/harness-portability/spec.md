## ADDED Requirements

### Requirement: Capture is an owned skill over connected sources
contexture SHALL ship `ctxr-capture` as a contexture-owned skill, delivered by `init` and refreshed by `update` like every other owned skill. The skill SHALL carry the procedure for bringing external material into the configured inbox: locate the material among whatever sources the harness has connected rather than assuming a particular one is present; write the source's record into the inbox; stamp the source type and source id while leaving the two fields ingest assigns unset; run the dedupe check when the material may already be in the store; and end by handing off to the ingest-orchestration skill. The skill SHALL NOT instruct the agent to decide what the store should know, which note to write, or where it belongs — those are the ingest-orchestration and placement skills' procedures, and capture ends before them.

The skill's steps MAY name tools contexture does not provide, on the same footing as the submit and land skills naming `git` and `gh`. contexture SHALL NOT ship a client, credential handling, or an adapter kind for any capture source.

#### Scenario: The capture skill is delivered and refreshed like every owned skill
- **WHEN** `init` writes a store, and a later `update` runs after the shipped copy has drifted
- **THEN** a full copy of the capture skill sits at the configured skills path in the skill layout marked as managed, and update rewrites the drifted copy to the installed version

#### Scenario: Capture ends at the handoff, not at a note
- **WHEN** the rendered capture skill's final step is read
- **THEN** it hands off to the ingest-orchestration skill, and no step of it instructs creating, expanding, merging, or restructuring a note

### Requirement: The capture skill names no particular source
The rendered capture skill SHALL express its steps without naming any capture service, server, or source-type value. Where the procedure needs a source type it SHALL direct the agent to the source system's own name, and where it needs a source id it SHALL specify a form composed from that source type and the source system's own stable identifier, so the same procedure holds for any harness and any connected source. The enforcing mechanism is a check over the rendered skill set, on the same footing as the checks that keep a shipped taxonomy profile's layer names out of the rendered skills.

#### Scenario: A source-type literal does not reach the shipped text
- **WHEN** the owned skill set is rendered for a store
- **THEN** the capture skill names no capture service and no literal source-type value, and the check over the rendered set passes

#### Scenario: A store's own source types remain the vocabulary
- **WHEN** an agent follows the rendered capture skill against a connected source
- **THEN** the source type it records is the source system's own name, not one contexture supplied

### Requirement: The capture skill distinguishes the record from a summary of it
The rendered capture skill SHALL state that a capture is the source's record, written as the source supplied it, and that a summary the source itself produced is retained as that source's own derivation in a section distinct from the record rather than in place of it. Because material reaching the agent through a connected source passes through the agent before it is written, this SHALL be stated in the skill; the mechanism that enforces it is the ingest precondition a store declares (per `context-ingest`), not the instruction alone.

#### Scenario: The skill states the distinction
- **WHEN** the rendered capture skill is read
- **THEN** it names the record as what the capture must carry, and names a source-supplied summary as a derivation retained alongside the record rather than as a substitute for it

#### Scenario: The instruction is backed by a check, not trusted on its own
- **WHEN** a store declares a required capture section for a source type and a capture of that type carries only a summary
- **THEN** ingest refuses it (per `context-ingest`), so the outcome does not depend on the skill having been followed
