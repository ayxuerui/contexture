## MODIFIED Requirements

### Requirement: A published page's structural invariants are checked mechanically
`ctxr publish check <path>` SHALL verify, for the `index.html` at `<path>`: it contains no external
network reference (no `http://` or `https://` value in a `src` or `href` attribute), it declares a
viewport meta tag, it declares at least one `@media print` rule, it states a provenance line pairing a
date with a link to its sibling README, it declares a non-empty `<title>`, its sibling README exists,
its sibling README's frontmatter declares no `kind` field, and — when it contains one or more
`<script>` blocks — each block is syntactically valid. It SHALL additionally verify the page's filing
location: that the folder holding the checked index page sits inside at least one grouping directory
beneath the store's configured publish path, rather than being an immediate child of that path, and
SHALL report a page filed directly at the publish path as a named failing check. That check answers
the filing *shape* only — which grouping directory a given page belongs under is not derivable from
the page and SHALL NOT be checked. It SHALL exit non-zero and name every failing check in one run,
not only the first.

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

#### Scenario: A page with no title fails the check
- **WHEN** `ctxr publish check <path>` runs against a page whose `index.html` declares no `<title>`, or
  declares one that is empty
- **THEN** the command exits non-zero and names the title check as failing

#### Scenario: A page satisfying every invariant exits successfully
- **WHEN** `ctxr publish check <path>` runs against a page satisfying every check above
- **THEN** the command exits with the success code and names no failing check

#### Scenario: A page filed directly at the publish path fails the location check
- **WHEN** `ctxr publish check <path>` runs against a page whose folder is an immediate child of the
  store's configured publish path, inside no grouping directory
- **THEN** the command exits non-zero and names the filing-location check as failing, while still
  reporting the result of every other check in the same run

#### Scenario: A page filed inside a grouping directory passes the location check at any depth
- **WHEN** `ctxr publish check <path>` runs against a page whose folder sits beneath one or more
  grouping directories under the store's configured publish path
- **THEN** the command names no filing-location failure, whether that page sits one grouping
  directory deep or several

#### Scenario: The location check names no expected directory
- **WHEN** the filing-location check fails for a page
- **THEN** the reported failure names that the page is filed directly at the configured publish path,
  and does not name any particular directory the page should have been filed under — no such
  directory is derivable from the page
