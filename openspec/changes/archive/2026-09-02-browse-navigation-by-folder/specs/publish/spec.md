## MODIFIED Requirements

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
