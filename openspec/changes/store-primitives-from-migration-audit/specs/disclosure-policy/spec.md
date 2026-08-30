## Purpose

Extends the disclosure-policy capability (see `visibility-contexts-and-wall-verdicts`): a leak scan finds content belonging to one context inside notes another context can see.

## ADDED Requirements

### Requirement: A leak scan uses markers and the context mapping
Configuration MAY map a context to marker patterns. `ctxr lint` SHALL report a finding for every marker match whose context cannot see the containing note under the configured context mapping, naming the note, the context, and the matched text; `ctxr check <note> --scan` SHALL report the same findings for one note. With no markers configured the check SHALL produce no findings.

#### Scenario: A marker leaks across the wall
- **WHEN** a marker for `ctx-b` matches inside a note whose resolved visibility is visible only to `ctx-a`
- **THEN** lint reports a leak finding for that note naming `ctx-b`

#### Scenario: A marker inside its own context is not a leak
- **WHEN** the same marker matches inside a note that `ctx-b` can see
- **THEN** no finding is reported

#### Scenario: No markers, no findings
- **WHEN** the configuration declares no markers
- **THEN** lint reports no leak findings for any note
