## ADDED Requirements

### Requirement: Lint reports disposable pages past their window
`ctxr lint` SHALL report, as an observation, every disposable page under the store's configured
publish path whose name's leading date is more than 30 days before the current date, naming the page's
path and its age in days, as a candidate for removal. The window SHALL be a fixed 30 days. A disposable
page whose name carries no valid leading date SHALL NOT be reported by this observation, its shape
being the publish capability's check. `ctxr lint` SHALL remove, move and modify nothing under the
configured publish path, SHALL exit 0 whatever this observation reports, and `ctxr doctor` SHALL NOT
report the same condition.

#### Scenario: A disposable page past the window is listed
- **WHEN** the current date is 2026-10-13 and a disposable page is named `2026-08-29-agent-week`
- **THEN** `ctxr lint` reports it as a removal candidate aged 45 days, and exits 0

#### Scenario: A disposable page within the window is not listed
- **WHEN** the current date is 2026-10-13 and a disposable page is named `2026-10-03-agent-week`
- **THEN** `ctxr lint` does not report it

#### Scenario: Lint removes nothing
- **WHEN** `ctxr lint` reports one or more removal candidates
- **THEN** every file under the configured publish path is unchanged from before it ran

#### Scenario: An old disposable page does not fail doctor
- **WHEN** a disposable page is 400 days old and every other doctor check passes
- **THEN** `ctxr doctor` exits 0

### Requirement: Lint reports permanent pages out of step with the note they represent
`ctxr lint` SHALL report, as an observation, every permanent page under the store's configured
publish path that `ctxr publish check` would fail on its represented-note or represented-note-hash
check — a page that names no resolvable note, one that is not stamped, and one that is stale against
its note — naming the page's path, the represented note when one resolves, and which of the three
applies. It SHALL exit 0 whatever this observation reports, and `ctxr doctor` SHALL NOT report the
same condition.

#### Scenario: A stale page is listed with its note
- **WHEN** a permanent page was stamped and its represented note has changed since
- **THEN** `ctxr lint` reports the page as stale, naming the note, and exits 0

#### Scenario: Pages that predate stamping are listed for migration
- **WHEN** a store's permanent pages were all built before stamping existed
- **THEN** `ctxr lint` reports each one, as not stamped or as naming no resolvable note, and `ctxr doctor`
  reports none of them

#### Scenario: A current page is silent
- **WHEN** a permanent page's README leads with an existing note and its marker matches that note's
  current hash
- **THEN** `ctxr lint` does not report it
