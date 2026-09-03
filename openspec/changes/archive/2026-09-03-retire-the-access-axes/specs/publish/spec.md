## MODIFIED Requirements

### Requirement: A published page's structural invariants are checked mechanically
`ctxr publish check <path>` SHALL verify, for the `index.html` at `<path>`: it contains no external
network reference (no `http://` or `https://` value in a `src` or `href` attribute), it declares a
viewport meta tag, it declares at least one `@media print` rule, it states a provenance line pairing a
date with a link to its sibling README, its sibling README exists, its sibling README's frontmatter
declares no `kind` field, and — when it contains one or more `<script>` blocks — each block is
syntactically valid. It SHALL exit non-zero and name every failing check in one run, not only the
first.

#### Scenario: A page referencing an external network resource fails the check
- **WHEN** `ctxr publish check <path>` runs against a page whose `index.html` loads a script or
  stylesheet from an external URL
- **THEN** the command exits non-zero and names the external-reference check as failing

#### Scenario: A page missing its sibling README fails the check
- **WHEN** `ctxr publish check <path>` runs against a page folder with no README file
- **THEN** the command exits non-zero and names the missing-README check as failing

#### Scenario: A page with a syntactically invalid embedded script fails the check, naming the block
- **WHEN** `ctxr publish check <path>` runs against a page containing a `<script>` block with a syntax
  error
- **THEN** the command exits non-zero, names the script-syntax check as failing, and identifies which
  script block failed

#### Scenario: A page satisfying every invariant exits successfully
- **WHEN** `ctxr publish check <path>` runs against a page satisfying every check above
- **THEN** the command exits with the success code and names no failing check

## REMOVED Requirements

### Requirement: A publish subject resolves to a note set
**Reason**: One of the four selectors, `--as <context>`, resolved "every note that context's configured visibility mapping admits" — a mapping removed with the `context-visibility` capability. The other three selectors are unchanged and are restated below under a name that no longer implies a fourth.
**Migration**: `--as` is removed from `ctxr publish gather`. A caller publishing "everything context X can see" has no equivalent; the nearest substitute is `--under <prefix>` over the subtree that content lives in.

### Requirement: A publish subject is gated by disclosure before any content is used
**Reason**: The `disclosure-policy` capability is retired; there is no verdict left to gate with. With hard walls and internal audiences both shipping empty, this gate returned ASK for every note in every default store — it deferred every decision rather than deciding any. See `design.md` D5.
**Migration**: `--audience` is removed from `ctxr publish gather`. The agent and its publish skill judge what belongs in a page. `design.md` D5 records the intended successor: a configured pattern scan against the built `index.html` at `ctxr publish check`, which checks the artifact that actually leaves the store rather than the notes that fed it.

### Requirement: The subject-level exit code is the resolved set's aggregate verdict
**Reason**: Same as above — with no per-note verdict there is no aggregate to exit with.
**Migration**: `ctxr publish gather` exits with the success code on a successful enumeration and non-zero only on a usage or resolution error. A script branching on the DENY (4) or ASK (5) codes will no longer see them; those codes stay reserved and unused (D4). An empty resolved set is still reported with a count of zero.

## ADDED Requirements

### Requirement: A publish subject resolves to a note set from a subtree, a note, or an entity
`ctxr publish gather` SHALL accept exactly one subject selector and resolve it to a set of source
notes: a store subtree (a path prefix, every retrievable note under it), a single note, or an entity
(the notes linking to it, the same enumeration `ctxr rollup gather` uses). It SHALL report the
resolved set together with its count, and SHALL exit with the success code on a successful
resolution, gating nothing.

#### Scenario: A subtree selector resolves every note under a prefix
- **WHEN** `ctxr publish gather --under <prefix>` runs
- **THEN** the resolved set is every retrievable note whose path is at or under `<prefix>`

#### Scenario: A note selector resolves to exactly one note
- **WHEN** `ctxr publish gather --note <path>` runs
- **THEN** the resolved set contains exactly that note

#### Scenario: An entity selector resolves to its backlinks
- **WHEN** `ctxr publish gather --entity <name>` runs
- **THEN** the resolved set is every note whose body links to `<name>`, identical to what `ctxr rollup gather <name>` would enumerate

#### Scenario: A successful enumeration exits zero
- **WHEN** `ctxr publish gather --under <prefix> --json` runs against a store containing notes under `<prefix>`
- **THEN** the command exits with the success code and the JSON output lists every note in the resolved set with no per-note verdict

#### Scenario: An empty resolved set is reported as empty
- **WHEN** a subject selector resolves to zero notes
- **THEN** the command exits with the success code and reports a resolved-note count of zero
