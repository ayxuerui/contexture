# publish Specification

## Purpose

Governs turning store content into a shareable page for a subject — a store subtree, a single note, a
or a concept: how its source notes are named and resolved, and the mechanical checks a finished page
must pass —
independent of what the page looks like or how it is built, which stay outside this capability.

## Requirements

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

### Requirement: A living page's identity is validated and never silently overwritten
`ctxr publish new <slug>` SHALL accept a `<slug>` naming either a single folder or a multi-segment path
under the store's configured publish path, so a page can be filed in a directory structure of the
author's choosing. It SHALL refuse, with a non-zero exit naming the reason, a `<slug>` whose final
segment begins with a date pattern (`YYYY-` or `YYYY-MM-DD-`) for a living (non-snapshot) page — the
final segment is the page's own identity, and the reserved dated naming applies to it rather than to
the directories containing it. It SHALL refuse, with a non-zero exit naming the reason, a `<slug>`
containing any segment that would resolve outside the configured publish path, writing nothing. It
SHALL refuse, with a non-zero exit, to scaffold a page at a `<slug>` for which a page folder already
exists. On success it SHALL create the page's folder, together with any intermediate directories its
path names, and a sibling README file containing the required section headings (intent, source notes,
audience, spec).

#### Scenario: A date-prefixed slug is refused
- **WHEN** `ctxr publish new 2026-01-01-example` runs
- **THEN** the command exits non-zero and no folder is created

#### Scenario: A date-prefixed final segment is refused at any depth
- **WHEN** `ctxr publish new folder-a/2026-01-01-example` runs
- **THEN** the command exits non-zero and no folder is created, exactly as for a single-segment slug

#### Scenario: The date rule binds the page's own segment, not its parent directories
- **WHEN** `ctxr publish new` runs with a slug whose intermediate directory begins with a date pattern
  and whose final segment does not
- **THEN** the command succeeds and scaffolds the page, because the reserved dated naming applies to a
  page's own identity, not to the directories it is filed under

#### Scenario: An ordinary slug scaffolds a folder with the required README headings
- **WHEN** `ctxr publish new project-example` runs against a slug with no existing folder
- **THEN** a folder is created containing a sibling README with the intent, source notes, audience, and spec headings, and no page markup is written into it beyond a minimal skeleton

#### Scenario: A multi-segment slug scaffolds the page at that path
- **WHEN** `ctxr publish new folder-a/folder-b/example-page` runs and no folder exists at that path
- **THEN** the page folder is created at that path under the configured publish path, with its
  intermediate directories, holding the same skeleton and sibling README a single-segment slug produces

#### Scenario: A slug that would escape the publish path is refused
- **WHEN** `ctxr publish new` runs with a slug containing a parent-directory segment, an empty segment,
  or an absolute path
- **THEN** the command exits non-zero naming the reason and writes nothing, inside or outside the
  configured publish path

#### Scenario: An existing page folder is never silently overwritten
- **WHEN** `ctxr publish new <slug>` runs and a folder already exists at that slug
- **THEN** the command exits non-zero and leaves the existing folder unchanged

### Requirement: A published page's structural invariants are checked mechanically
`ctxr publish check <path>` SHALL verify, for the `index.html` at `<path>`: it contains no external
network reference (no `http://` or `https://` value in a `src` or `href` attribute), it declares a
viewport meta tag, it declares at least one `@media print` rule, it states a provenance line pairing a
date with a link to its sibling README, its sibling README exists, its sibling README's frontmatter
declares no `kind` field, and — when it contains one or more `<script>`
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
