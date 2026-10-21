## REMOVED Requirements

### Requirement: A page's PDF renderings sit at its folder root under a dated file name
**Reason**: Replaced by "A page's send copies sit at its folder root under a dated file name", which
holds `.docx`, `.xlsx` and `.pptx` files to the rule PDFs were held to, under format-neutral names.
**Migration**: The `pdf-name` check is now `send-copy-name`, and `ctxr publish check`'s `pdfs` field
is now `send_copies`, with the same entry shape. A page that passed before passes now; a page
holding an undated `.docx`, `.xlsx` or `.pptx` at its folder root newly fails.

## ADDED Requirements

### Requirement: A page's send copies sit at its folder root under a dated file name
A file whose name ends in `.pdf`, `.docx`, `.xlsx` or `.pptx`, compared without regard to case,
directly inside a page folder — the folder holding the page's `index.html`, not a subfolder of it —
SHALL be a send copy of that page. Its file name SHALL be `<YYYY-MM-DD>-<name>.<extension>`, led by
a real calendar date followed by a non-empty name. A file in any subfolder of a page folder SHALL be
an input the page uses and SHALL NOT be subject to this requirement, whatever its format. No other
format SHALL be treated as a send copy.

`ctxr publish check <path>` SHALL fail, named as the `send-copy-name` check, for each send copy
whose file name does not satisfy that form, naming the file. It SHALL report this failure in the same
run as every other check, for a permanent and a disposable page alike. A page folder holding no send
copy SHALL produce no `send-copy-name` result.

`ctxr publish check` SHALL list, in its machine-readable output under `send_copies`, every send copy
with its store-relative path and the address the browsing surface answers for it, sorted by file
name; and SHALL state the number of send copies in its human-readable summary when there is at least
one. Listing them SHALL gate nothing.

`ctxr publish check <path>` SHALL accept, as `<path>`, a send copy, and SHALL then check that
folder's `index.html` exactly as if `<path>` had named it. When that folder holds no `index.html`,
the command SHALL exit non-zero naming the missing index page, as it does for any page whose index
page does not exist.

A page's representation and staleness SHALL be read from its README alone, as for every page. The
presence, number, formats or dates of its send copies SHALL NOT change whether a page is reported
stale.

#### Scenario: A dated send copy in each format passes
- **WHEN** `ctxr publish check <path>` runs against a page that satisfies every other check and
  holds `2026-01-15-brief.pdf`, `2026-01-15-brief.docx`, `2026-01-15-model.xlsx` and
  `2026-01-15-deck.pptx` beside its `index.html`
- **THEN** the command exits with the success code, names no `send-copy-name` failure, and lists all
  four under `send_copies`, each with its address

#### Scenario: An undated send copy fails, named, in any format
- **WHEN** `ctxr publish check <path>` runs against a page holding `model.xlsx` beside its
  `index.html`
- **THEN** the command exits non-zero, names the `send-copy-name` check as failing for `model.xlsx`,
  and still reports the result of every other check in the same run

#### Scenario: A send copy named with an impossible date fails
- **WHEN** a page holds `2026-02-30-brief.docx` beside its `index.html`
- **THEN** `ctxr publish check <path>` names the `send-copy-name` check as failing for that file

#### Scenario: The extension is matched without regard to case
- **WHEN** a page holds `Brief.PDF` beside its `index.html`
- **THEN** `ctxr publish check <path>` names the `send-copy-name` check as failing for that file

#### Scenario: A file under the page's assets is an input, not a send copy
- **WHEN** a page holds `assets/kickoff.pdf` and `assets/source-data.xlsx` and no send copy at its
  folder root
- **THEN** `ctxr publish check <path>` names no `send-copy-name` failure and lists no send copy

#### Scenario: A format outside the four is not a send copy
- **WHEN** a page holds `data.csv` beside its `index.html`
- **THEN** `ctxr publish check <path>` names no `send-copy-name` failure and lists no send copy

#### Scenario: Each earlier send copy is listed beside the newest
- **WHEN** a page holds `2026-01-15-brief.pdf` and `2026-03-02-brief.pdf` beside its `index.html`
- **THEN** `ctxr publish check --json` lists both under `send_copies`, in that order, each with its
  own address

#### Scenario: Naming a send copy checks its page
- **WHEN** `ctxr publish check <path>` runs with `<path>` naming `2026-01-15-model.xlsx` at a page
  folder's root
- **THEN** the result is the result of checking that folder's `index.html`

#### Scenario: A send copy does not make a page current
- **WHEN** a stamped permanent page's represented note changes, and a new dated send copy is then
  added to the page folder without the README being restamped
- **THEN** `ctxr publish check <path>` still names the represented-note-hash check as failing
  because the page is stale
