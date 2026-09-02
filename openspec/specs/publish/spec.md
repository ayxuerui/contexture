# publish Specification

## Purpose

Governs turning store content into a shareable page for a subject — a store subtree, a single note, a
concept, or a named context: how its source notes are named and resolved, how that set is gated by
disclosure before any content is used, and the mechanical checks a finished page must pass —
independent of what the page looks like or how it is built, which stay outside this capability.

## Requirements

### Requirement: A publish subject resolves to a note set
`ctxr publish gather` SHALL accept exactly one subject selector and resolve it to a set of source
notes: a store subtree (a path prefix, every retrievable note under it), a single note, an entity (the
notes linking to it, the same enumeration `ctxr rollup gather` uses), or a named context (every note
that context's configured visibility mapping admits).

#### Scenario: A subtree selector resolves every note under a prefix
- **WHEN** `ctxr publish gather --under <prefix>` runs
- **THEN** the resolved set is every retrievable note whose path is at or under `<prefix>`

#### Scenario: A note selector resolves to exactly one note
- **WHEN** `ctxr publish gather --note <path>` runs
- **THEN** the resolved set contains exactly that note

#### Scenario: An entity selector resolves to its backlinks
- **WHEN** `ctxr publish gather --entity <name>` runs
- **THEN** the resolved set is every note whose body links to `<name>`, identical to what `ctxr rollup gather <name>` would enumerate

#### Scenario: A context selector resolves to everything that context admits
- **WHEN** `ctxr publish gather --as <context>` runs
- **THEN** the resolved set is every note whose resolved visibility `<context>` can see, per the store's configured context mapping

### Requirement: A publish subject is gated by disclosure before any content is used
`ctxr publish gather` SHALL require an `--audience <audience>` and SHALL evaluate every note in the
resolved set through the same tri-state disclosure evaluation `ctxr check <note> --audience <audience>`
performs, reporting each note's individual verdict and deciding rung alongside the resolved set — so
that no note's content is available to an agent building a page before that note's own verdict is known.

#### Scenario: Every resolved note carries an individual verdict
- **WHEN** `ctxr publish gather --under <prefix> --audience <audience> --json` runs
- **THEN** the JSON output lists every note in the resolved set together with its own ALLOW, DENY, or ASK verdict and the rung that produced it

#### Scenario: A missing audience is refused
- **WHEN** `ctxr publish gather` runs with a subject selector but no `--audience`
- **THEN** the command exits non-zero with the same error condition `ctxr check` reports for a missing `--audience`, before resolving or evaluating anything

### Requirement: The subject-level exit code is the resolved set's aggregate verdict
`ctxr publish gather` SHALL exit with the exit code corresponding to the resolved set's aggregate
verdict, computed per disclosure-policy's most-restrictive-member aggregation over the per-note
verdicts. An empty resolved set SHALL exit with the ALLOW code while being reported with a count of
zero notes, distinguishing it from a genuinely evaluated all-ALLOW set.

#### Scenario: A single DENY dominates an otherwise-ALLOW set
- **WHEN** the resolved set contains nine notes that evaluate ALLOW and one that evaluates DENY
- **THEN** `ctxr publish gather` exits with the DENY exit code

#### Scenario: An ASK dominates a set with no DENY
- **WHEN** the resolved set contains notes that evaluate ALLOW and ASK but none that evaluate DENY
- **THEN** `ctxr publish gather` exits with the ASK exit code

#### Scenario: An empty resolved set is distinguishable from a real ALLOW
- **WHEN** a subject selector resolves to zero notes
- **THEN** `ctxr publish gather` exits with the ALLOW exit code and reports a resolved-note count of zero, rather than reporting as though a non-empty set was evaluated and allowed

### Requirement: A living page's identity is validated and never silently overwritten
`ctxr publish new <slug>` SHALL refuse, with a non-zero exit naming the reason, a `<slug>` beginning
with a date pattern (`YYYY-` or `YYYY-MM-DD-`) for a living (non-snapshot) page, and SHALL refuse, with
a non-zero exit, to scaffold a page at a `<slug>` for which a page folder already exists. On success it
SHALL create the page's folder together with a sibling README file containing the required section
headings (intent, source notes, audience, spec).

#### Scenario: A date-prefixed slug is refused
- **WHEN** `ctxr publish new 2026-01-01-example` runs
- **THEN** the command exits non-zero and no folder is created

#### Scenario: An ordinary slug scaffolds a folder with the required README headings
- **WHEN** `ctxr publish new project-example` runs against a slug with no existing folder
- **THEN** a folder is created containing a sibling README with the intent, source notes, audience, and spec headings, and no page markup is written into it beyond a minimal skeleton

#### Scenario: An existing page folder is never silently overwritten
- **WHEN** `ctxr publish new <slug>` runs and a folder already exists at that slug
- **THEN** the command exits non-zero and leaves the existing folder unchanged

### Requirement: A published page's structural invariants are checked mechanically
`ctxr publish check <path>` SHALL verify, for the `index.html` at `<path>`: it contains no external
network reference (no `http://` or `https://` value in a `src` or `href` attribute), it declares a
viewport meta tag, it declares at least one `@media print` rule, it states a provenance line pairing a
date with a link to its sibling README, its sibling README exists, its sibling README's frontmatter
declares neither the visibility field nor a `kind` field, and — when it contains one or more `<script>`
blocks — each block is syntactically valid. It SHALL exit non-zero and name every failing check in one
run, not only the first.

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
