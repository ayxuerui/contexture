## REMOVED Requirements

### Requirement: Entries carry gloss and resolved visibility
**Reason**: The `context-visibility` capability is retired. This requirement's second half was never met by shipped code in any case — `readCatalogSection` discards its requesting-context argument (`void asContext; // visibility filtering wired in Phase 5`), so `catalog show --as` has always returned an unfiltered catalog while `--help` advertised a filter. The requirement is removed rather than implemented, per the decision in `design.md`; the gloss half is restated below.
**Migration**: `--as <context>` is removed from `ctxr catalog show`. Because the filter was never applied, no caller's output changes — only the flag and the unmet claim disappear.

## ADDED Requirements

### Requirement: Entries carry a gloss
Each catalog entry SHALL record the note's authored gloss alongside its identity.

#### Scenario: An entry carries its gloss
- **WHEN** `contexture catalog show` is invoked against a store whose catalog has authored glosses
- **THEN** each entry appears with its identity and its gloss text
