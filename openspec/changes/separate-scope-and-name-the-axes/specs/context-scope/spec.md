## Purpose

Governs which bodies of knowledge a note belongs to, and how naming one narrows what retrieval considers. Scope is a selector: it improves relevance and fails open, which is what distinguishes it from the visibility field's permission gate. The frontmatter key carrying a note's scope is the scope field defined by `context-store`; this capability never names that key directly and refers throughout to "the scope field."

## ADDED Requirements

### Requirement: Scope resolves in a fixed order and is multi-valued
A note's scope SHALL resolve to a list of scope names, in this order: (1) an explicit list in the note's scope field, a bare single value being read as a one-element list; (2) a directory default declared in `contexture.yaml` for the note's path, the longest matching path prefix winning; (3) failing both, the configured default scope list named in `contexture.yaml`. The resolution SHALL report both the resolved list and which of the three steps produced it, and the third step's reason SHALL be reported as an ordinary default rather than as a fail-closed outcome.

#### Scenario: An explicit list wins over a directory default
- **WHEN** a note under a directory whose configured default scope is `[scope-a]` carries an explicit scope field value of `[scope-b, scope-c]`
- **THEN** the resolved scope is `[scope-b, scope-c]` with the reason "explicit"

#### Scenario: A bare value resolves as a one-element list
- **WHEN** a note's scope field carries a single value rather than a list
- **THEN** the resolved scope is a one-element list containing that value

#### Scenario: The longest matching directory prefix wins
- **WHEN** a note sits under a path matched by two configured directory defaults, one a prefix of the other
- **THEN** the more specific (longer) prefix's list is the resolved scope, with the reason "directory default"

#### Scenario: Neither rung applies
- **WHEN** a note has no scope field and sits under a directory with no configured default
- **THEN** the resolved scope is the configured default scope list, and the reported reason distinguishes this rung from the other two

### Requirement: Scope narrows retrieval and is not a security boundary
The scope selector SHALL be a relevance mechanism only. No specification SHALL assert that scope withholds a note from a requesting party, and no check SHALL fail a store on the basis that a note is reachable under a scope the requester did not name. A retrieval operation invoked with no scope selector SHALL consider every note the visibility field admits, except as the isolating-scope requirement below provides. Where a note must be withheld, the mechanism is the visibility field's pre-filter, defined in the context-visibility capability, never this one.

#### Scenario: Omitting the selector narrows nothing
- **WHEN** a filtered retrieval operation is invoked with a requesting context but no scope selector
- **THEN** every note that context may see is considered, regardless of the notes' resolved scopes

#### Scenario: Scope does not substitute for permission
- **WHEN** a note's resolved scope is `scope-a` and a retrieval operation names scope `scope-b`, while the note's resolved visibility is one the requesting context can see
- **THEN** the note is absent from that operation's results because it is out of the named scope, and the store reports no permission finding of any kind for it

### Requirement: Scope selection consults a configured includes mapping
`contexture.yaml` MAY declare, for any named scope, a list of additional scope names it includes. A retrieval operation naming a scope SHALL consider a note in scope when any member of the note's resolved scope list is the named scope itself or a member of that scope's configured includes list. A scope with no configured entry SHALL select exactly the notes whose resolved scope list contains that scope's own name.

#### Scenario: An included scope is selected alongside the named one
- **WHEN** configuration declares that `scope-a` includes `scope-shared`, and a note's resolved scope is `[scope-shared]`
- **THEN** a retrieval operation naming `scope-a` considers that note

#### Scenario: An unconfigured scope selects only its own name
- **WHEN** configuration declares no includes entry for `scope-a`
- **THEN** naming `scope-a` considers exactly the notes whose resolved scope list contains `scope-a`, identically to a store created before the mapping existed

### Requirement: An isolating scope inverts the selection default
Configuration MAY declare a named scope isolating. A note whose resolved scope list contains an isolating scope SHALL be excluded from any retrieval operation that does not name that scope, or a scope whose includes list contains it, and SHALL be excluded before that operation ranks, traverses, or otherwise processes results — by the same pre-filter that enforces the visibility field. A scope not declared isolating SHALL behave exactly as the selector requirement above describes.

#### Scenario: An isolating scope is absent unless requested
- **WHEN** `scope-a` is declared isolating, a note's resolved scope is `[scope-a]`, and a retrieval operation is invoked with no scope selector
- **THEN** that note is absent from the operation's results

#### Scenario: Naming the isolating scope admits it
- **WHEN** the same operation names `scope-a`
- **THEN** that note is considered

#### Scenario: An isolating note contributes no edges
- **WHEN** a graph traversal that does not name `scope-a` would otherwise pass through a note whose resolved scope contains the isolating `scope-a`
- **THEN** that note contributes no edges to the traversal and appears in no result, rather than being omitted from the final list after traversal

### Requirement: Mixing an isolating scope with another scope fails a check
`ctxr doctor` SHALL exit non-zero, naming the note and both scopes, whenever a note's resolved scope list contains a scope declared isolating together with any other scope. Without this check the isolating guarantee is defeated, because naming the other scope would surface the note.

#### Scenario: A mixed note fails doctor
- **WHEN** `scope-a` is declared isolating and a note's resolved scope is `[scope-a, scope-b]`
- **THEN** `doctor` reports a failing check naming that note, `scope-a`, and `scope-b`

#### Scenario: A note in one isolating scope alone passes
- **WHEN** `scope-a` is declared isolating and a note's resolved scope is `[scope-a]`
- **THEN** the check reports no finding for that note

### Requirement: Reliance on the configured default scope is reported, not failed
`ctxr lint` SHALL report, at a severity that does not fail the command, every note whose scope resolution reached the configured-default rung, so an operator can find notes that have never been placed. It SHALL NOT treat this as a failing check, because the default scope is a supported resting state rather than a missing classification.

#### Scenario: A defaulted note is surfaced without failing
- **WHEN** `lint` runs against a store containing a note with no scope field and no applicable directory default, and no other finding applies
- **THEN** the report lists that note under a scope-default finding and `lint` exits zero
