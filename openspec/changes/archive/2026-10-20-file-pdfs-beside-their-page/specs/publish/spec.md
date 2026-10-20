## ADDED Requirements

### Requirement: A page's PDF renderings sit at its folder root under a dated file name
A file ending in `.pdf` directly inside a page folder — the folder holding the page's `index.html`,
not a subfolder of it — SHALL be a rendering of that page. Its file name SHALL be
`<YYYY-MM-DD>-<name>.pdf`, led by a real calendar date followed by a non-empty name. A PDF in any
subfolder of a page folder SHALL be an input the page uses and SHALL NOT be subject to this
requirement.

`ctxr publish check <path>` SHALL fail, named as the `pdf-name` check, for each PDF at the page
folder's root whose file name does not satisfy that form, naming the file. It SHALL report this
failure in the same run as every other check, for a permanent and a disposable page alike. A page
folder holding no PDF at its root SHALL produce no `pdf-name` result.

`ctxr publish check` SHALL list, in its machine-readable output, every PDF at the page folder's
root with its store-relative path and the address the browsing surface answers for it, sorted by
file name; and SHALL state the number of such PDFs in its human-readable summary when there is at
least one. Listing them SHALL gate nothing.

`ctxr publish check <path>` SHALL accept, as `<path>`, a PDF at a page folder's root, and SHALL then
check that folder's `index.html` exactly as if `<path>` had named it. When that folder holds no
`index.html`, the command SHALL exit non-zero naming the missing index page, as it does for any page
whose index page does not exist.

A page's representation and staleness SHALL be read from its README alone, as for every page. The
presence, number, or dates of its PDFs SHALL NOT change whether a page is reported stale.

#### Scenario: A dated PDF beside the index page passes
- **WHEN** `ctxr publish check <path>` runs against a page that satisfies every other check and
  holds `2026-01-15-brief.pdf` beside its `index.html`
- **THEN** the command exits with the success code, names no `pdf-name` failure, and lists that PDF
  with its address

#### Scenario: An undated PDF at the folder root fails, named
- **WHEN** `ctxr publish check <path>` runs against a page holding `brief.pdf` beside its
  `index.html`
- **THEN** the command exits non-zero, names the `pdf-name` check as failing for `brief.pdf`, and
  still reports the result of every other check in the same run

#### Scenario: A PDF named with an impossible date fails
- **WHEN** a page holds `2026-02-30-brief.pdf` beside its `index.html`
- **THEN** `ctxr publish check <path>` names the `pdf-name` check as failing for that file

#### Scenario: A PDF under the page's assets is an input, not a rendering
- **WHEN** a page holds `assets/kickoff.pdf` and no PDF at its folder root
- **THEN** `ctxr publish check <path>` names no `pdf-name` failure and lists no PDF

#### Scenario: Each earlier rendering is listed beside the newest
- **WHEN** a page holds `2026-01-15-brief.pdf` and `2026-03-02-brief.pdf` beside its `index.html`
- **THEN** `ctxr publish check --json` lists both, in that order, each with its own address

#### Scenario: Naming a PDF checks its page
- **WHEN** `ctxr publish check <path>` runs with `<path>` naming `2026-01-15-brief.pdf` at a page
  folder's root
- **THEN** the result is the result of checking that folder's `index.html`

#### Scenario: A PDF does not make a page current
- **WHEN** a stamped permanent page's represented note changes, and a new dated PDF is then added
  to the page folder without the README being restamped
- **THEN** `ctxr publish check <path>` still names the represented-note-hash check as failing
  because the page is stale
