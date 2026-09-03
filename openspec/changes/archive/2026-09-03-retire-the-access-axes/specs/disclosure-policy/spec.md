## REMOVED Requirements

### Requirement: Ordered walls-before-allows evaluation
**Reason**: The capability is retired. With `internal_audiences` and `hard_walls` both shipping empty, rungs 1 and 3 never fired and every evaluation fell to rung 4's ASK — a ladder that only ever deferred to a human. See `proposal.md` — Why, and `design.md` D5.
**Migration**: `ctxr check <note> --audience <audience>` is removed. A store that had configured hard walls should record them outside contexture before migrating; they are the clearest statement of its actual disclosure policy and `design.md` D5's publish-time pattern scan is the intended successor.

### Requirement: Tri-state verdict with distinct exit codes
**Reason**: Same as above — retired with the capability.
**Migration**: Exit codes 4 (DENY) and 5 (ASK) stay allocated and reserved in `src/core/exit-codes.ts`, unused rather than reassigned, so a P2 disclosure mechanism finds them waiting (D4). A script branching on them will no longer see them from any command.

### Requirement: External disclosure is never derived from visibility alone
**Reason**: Same as above — retired with the capability, both of whose axes are removed.
**Migration**: N/A structurally, but this invariant is the one worth carrying forward by hand: it is what stopped an agent reasoning "this context can see it, therefore it may go in the customer's email." `design.md` D5 records that a P2 role model must not quietly reintroduce that inference, which is why the intended successor check is artifact-side rather than note-side.

### Requirement: The internal-audience rung consults the context mapping
**Reason**: Same as above — retired with the capability, and with the context mapping it consulted.
**Migration**: N/A — neither the rung nor the mapping remains.

### Requirement: Hard walls may ask, match every audience, and exempt audiences
**Reason**: Same as above — retired with the capability. `disclosure.hard_walls` is removed from `contexture.yaml` by the `drop-access-axes` migration.
**Migration**: See the first requirement above — record configured walls outside contexture before migrating.

### Requirement: A leak scan uses markers and the context mapping
**Reason**: Same as above — retired with the capability, which supplied both the markers and the mapping the scan compared them against.
**Migration**: `disclosure.leak_markers` is removed. This is the requirement closest to the real need, and `design.md` D5 records its successor: a pattern scan against a built `index.html` at `ctxr publish check`, which needs no context mapping because it checks the artifact that leaves the store rather than the notes that fed it. A store with configured markers should keep them for that.

### Requirement: A set of verdicts aggregates to its most restrictive member
**Reason**: Same as above — retired with the capability. With no per-note verdict there is no set to aggregate.
**Migration**: N/A — `ctxr publish gather` no longer exits with an aggregate verdict; it exits 0 on a successful enumeration.
