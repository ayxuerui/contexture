## ADDED Requirements

### Requirement: The organize-audit skill carries a migration recipe
The shipped organize-audit skill SHALL state, for a restructure that moves folders, the order:
1. commit unrelated uncommitted work as a snapshot rather than aborting;
2. preflight by searching the store for the old path prefixes and for wikilinks written with a path, using `ctxr doctor` for ambiguous links;
3. make the moves and their wikilink fixes one commit, separate from tooling and doc patches;
4. stage surgically by diffing each staged file against the snapshot;
5. rebuild the derived artifacts, run `ctxr lint` and `ctxr doctor`, and log the migration in the store log.

#### Scenario: The recipe is rendered in order
- **WHEN** the organize-audit skill is rendered for any store
- **THEN** its "Moves at scale" section names the snapshot, the preflight, the two commits, surgical staging, and the post-move rebuild and log, in that order
