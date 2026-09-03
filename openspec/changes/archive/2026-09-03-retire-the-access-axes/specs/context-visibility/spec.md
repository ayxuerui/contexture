## REMOVED Requirements

### Requirement: Visibility resolves in a fixed order
**Reason**: The capability is retired — access control is deferred to a P2 role model that will not have this shape. See `design.md` D5.
**Migration**: `ctxr note resolve` is removed along with the resolution order it reported. A note's existing visibility-field value stays in its frontmatter, unread, so nothing needs re-labelling if the concept returns (D3). A store that used `visibility.directory_defaults` to express "notes under this path belong to this area" keeps that information in the directory structure itself, which the taxonomy and `--under` already address.

### Requirement: Visibility is enforced as a pre-filter
**Reason**: Same as above — retired with the capability. This was the one requirement the shipped code genuinely honored, on graph traversal; `catalog show --as` and `listNotes`'s `as` parameter never implemented it.
**Migration**: N/A — no requesting context remains for any operation to filter against. `--as <context>` is removed from graph query, catalog show, and publish gather.

### Requirement: Every note has a resolvable visibility value
**Reason**: Same as above — retired with the capability. The lint finding and the corresponding doctor invariant are both removed.
**Migration**: N/A — there is no fail-closed default left to rely on, so nothing to report reliance on.

### Requirement: Visibility matching consults a configured context mapping
**Reason**: Same as above — retired with the capability. `visibility.contexts` is removed from `contexture.yaml` by the `drop-access-axes` migration.
**Migration**: A store that had configured a mapping loses it. The mapping's content is worth recording outside contexture before migrating if a P2 role model is expected to want it — it is the closest thing the store had to a grant table, and `design.md` D5 anticipates roles needing one.
