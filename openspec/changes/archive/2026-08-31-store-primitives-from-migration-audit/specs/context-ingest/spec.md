## Purpose

Extends the context-ingest capability (see `bootstrap-contexture-core`): the dedupe engine reports drift and alternative sources, and canonicalizes URL identities.

## ADDED Requirements

### Requirement: Source check distinguishes drift from duplication
`ctxr source check` SHALL report `drift` when a note with the same source identity exists but its recorded hash differs from the candidate's, in addition to the existing `new` and `duplicate` verdicts.

#### Scenario: Same identity, changed content
- **WHEN** a note records identity `src-1` with hash `h1` and the candidate has identity `src-1` with hash `h2`
- **THEN** the verdict is `drift` and the existing note's path is reported

### Requirement: Source identity can be recorded and extended
`ctxr source stamp <note>` SHALL write the source identity and hash into the note's provenance fields; `ctxr source add-alt <note>` SHALL append an alternative source identity so a later check against that identity reports `duplicate`.

#### Scenario: An alternative source is recognized
- **WHEN** `source add-alt` records `src-2` on a note ingested as `src-1`, and a candidate arrives with identity `src-2`
- **THEN** `source check` reports `duplicate` naming that note

### Requirement: URL identities are canonicalized before comparison
When a source identity is a URL, `source check` SHALL compare canonical forms: lowercased scheme and host, fragment removed, configured tracking parameters removed, trailing slash collapsed.

#### Scenario: Tracking parameters do not defeat dedupe
- **WHEN** a note was ingested from `https://Example.com/a/` and a candidate's identity is `https://example.com/a?utm_source=x#top`
- **THEN** the verdict is `duplicate`
