## ADDED Requirements

### Requirement: A store declares which captures owe a verbatim record
A store MAY declare, in `contexture.yaml` under `ingest.required_capture_sections`, a mapping from a source type the store uses to the section heading required of a capture recorded under that type. Both the source type and the heading SHALL be values the store supplies; contexture SHALL reserve neither and SHALL NOT substitute a shipped constant for either, so the mechanism applies to any source kind a store captures rather than to one contexture anticipated.

The key SHALL be schema-optional with no shipped default. A configuration that omits it SHALL parse, and omitting it SHALL mean the store has not opted into the mechanism rather than that it accepts a default. A store that declares nothing SHALL behave identically, in every command and in every generated file, to a store from before the key existed.

The store's generated capture guidance SHALL state the principle the declaration serves — that a capture stands as provenance only if it carries the record it rests on — and SHALL name whatever the store has declared, so an agent meets the rule where it already reads rather than first encountering it at a refusal.

#### Scenario: A store that declares nothing carries no trace of the mechanism
- **WHEN** a store's `contexture.yaml` declares no required capture sections
- **THEN** the configuration parses, every command returns what it returns for a store that declares one, and the generated capture guidance names no declaration — leaving no empty list, no dangling heading, and no blank line where the declaration would have been rendered

#### Scenario: The declaration is surfaced where captures are already documented
- **WHEN** a store declares that captures of source type `source-a` require a `section-a` section, and its generated guidance is rebuilt
- **THEN** the capture guidance states the principle and names that source type and that section

#### Scenario: Neither the source type nor the section is contexture's word
- **WHEN** two stores declare unrelated pairs — one requiring `section-a` of source type `source-a`, another requiring `section-b` of source type `source-b`
- **THEN** each store's declaration is enforced on its own terms, and no shipped source type or section name is required of, or substituted into, either

### Requirement: A capture missing its declared section is refused at ingest
When a store declares a required section for a source type, `ctxr ingest` SHALL refuse a capture being ingested under that source type unless the markdown record carries a non-empty section under the declared heading. The source type consulted SHALL be the one the capture will be recorded under — whether it arrives on the invocation or already sits in the capture's frontmatter — so naming a different source type on the invocation SHALL NOT route around the store's declaration.

A refusal SHALL exit non-zero, name the capture and the section it lacks, and write nothing: no identity field stamped, no capture moved out of the configured inbox path, no destination note's source list touched, and no catalog rebuilt.

Non-empty SHALL mean at least one non-blank line between the declared heading and the next heading at the same or a shallower level, or the end of the record. For a capture that is not markdown, the record read SHALL be the markdown sidecar ingest is given, per the sidecar requirement in this capability.

The check SHALL test that shape and nothing more. Whether the content under the declared heading is the complete record is not derivable from the capture and SHALL NOT be checked, and the refusal SHALL NOT name an expected length, coverage, or completeness standard. A capture whose source type the store has declared nothing about SHALL receive no such check.

#### Scenario: A capture missing its declared section is refused, writing nothing
- **WHEN** a store requires a `section-a` section of source type `source-a`, and `ctxr ingest` is run against a capture being recorded under `source-a` whose body carries no such section
- **THEN** the command exits non-zero naming the capture and the missing section, the capture is still at its path under the configured inbox path carrying neither a source hash nor an ingested date, and the destination note's source list is unchanged

#### Scenario: A capture carrying its declared section ingests like any other
- **WHEN** the same store ingests a capture recorded under `source-a` whose body carries a non-empty `section-a` section
- **THEN** the capture is stamped, retained under the capture tier's directory for the month, and cited from the destination note, exactly as a capture of an undeclared source type is

#### Scenario: A heading with nothing under it is not a section
- **WHEN** a capture recorded under `source-a` carries the `section-a` heading with no non-blank line beneath it before the next heading at the same or a shallower level
- **THEN** the command refuses it on the same footing as a capture carrying no such heading at all

#### Scenario: A different source type on the invocation does not route around the declaration
- **WHEN** a capture's frontmatter already records source type `source-a`, for which the store requires a `section-a` section, and `ctxr ingest` is invoked naming source type `source-b` for it, and the capture carries no `section-a` section
- **THEN** the command refuses it, naming the capture

#### Scenario: The refusal names what is missing, not what it should contain
- **WHEN** a capture is refused for a missing declared section
- **THEN** the reported failure names the capture and the section it lacks, and names no expected length, coverage, or completeness standard — none is derivable from the capture

#### Scenario: A capture of an undeclared source type is ungated
- **WHEN** a store declares a required section for `source-a` only, and `ctxr ingest` is run against a capture recorded under `source-b` that carries no sections at all
- **THEN** the capture is ingested exactly as it is for a store from before this requirement existed
