## REMOVED Requirements

### Requirement: Identity content is excluded from retrieval
**Reason**: The capability is retired — identity/memory is a harness-level concern, not something a context store models. See `design.md`'s Decisions.
**Migration**: A store that had identity files configured keeps those files untouched; contexture simply stops managing or excluding them. If they should stay excluded from retrieval, add their path to `retrieval.exclude_paths` directly.

### Requirement: Identity content is portable; wire format is harness-owned
**Reason**: Same as above — retired with the capability.
**Migration**: A harness's own memory mechanism (if any) owns its wire format directly; there is no longer a contexture-side abstraction over it.

### Requirement: Injection is performed by adapters
**Reason**: Same as above — retired with the capability. The `identity-injection` adapter kind is removed (see the `adapters` delta in this change).
**Migration**: N/A — no injection mechanism remains for contexture to delegate.

### Requirement: The canonical entry document references identity
**Reason**: Same as above — retired with the capability.
**Migration**: `AGENTS.md` no longer carries a generated identity section. A store that wants to point a harness at its own identity files documents that in its own conventions, referenced from `AGENTS.md`'s conventions index like any other operator-authored content.

### Requirement: Identity roles resolve to configurable paths
**Reason**: Same as above — retired with the capability.
**Migration**: N/A — there are no identity roles left to bind.

### Requirement: Identity files are edited as entries
**Reason**: Same as above — retired with the capability. `ctxr identity add|replace|remove` is removed.
**Migration**: A harness with its own entry-based memory primitive (e.g. Hermes's `memory` tool) continues to use it directly, outside contexture.
