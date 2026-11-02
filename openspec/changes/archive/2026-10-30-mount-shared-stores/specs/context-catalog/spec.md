## ADDED Requirements

### Requirement: Reading a section includes the same section of each mounted store
`ctxr catalog show --section <path-prefix>` SHALL output the mounting store's own entries under that prefix, then,
for each present mount that joins the read view (per shared-stores), the entries under the same prefix read from that
mounted store's own tracked catalog, under a heading naming the mount and with each entry's path carrying the mount's
location as a prefix. A mount whose catalog has no entries under that prefix SHALL contribute nothing. The command
SHALL NOT build, write, or correct a mounted store's catalog, and SHALL NOT copy a mounted store's entries into the
mounting store's catalog.

#### Scenario: A section reads across the store and its mounts
- **WHEN** `ctx-a` and its mount `ctx-b` both have catalog entries under `work`, and `ctxr catalog show --section work` runs in `ctx-a`
- **THEN** the output lists `ctx-a`'s entries, then `ctx-b`'s under a heading naming `ctx-b`, each of the latter with a path beginning `shared/ctx-b/`

#### Scenario: Reading a section writes nothing
- **WHEN** `ctxr catalog show` runs in `ctx-a`
- **THEN** no file in `ctx-a` or in any mount changes
