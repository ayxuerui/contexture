## MODIFIED Requirements

### Requirement: `Read`, `Grep` and `Glob` read the served commit or a member's own session
The surface SHALL offer `Read`, `Grep` and `Glob` with the names and parameters of Claude Code's own tools. Paths SHALL be store-relative, a leading `/` naming the store root. A path under the root of a session the calling member owns SHALL read that session's working tree; any other path SHALL read the commit being served. A path that leaves the store root, or lies under the store's retrieval exclusions, its configuration file, its derived paths or `.git`, SHALL be refused or never returned; the store's templates, catalog section files, house conventions, log, skills and published-pages location SHALL be readable. `Read` SHALL return file text numbered from 1 with an optional offset and limit and at most 2,000 lines per call, marking a capture as one. `Grep` SHALL match a regular expression with Claude Code's Grep parameters, ordered by path, with no score, within a fixed time and output bound, and when reading the served commit SHALL also list matching inbox files of session branches with an open pull request, marked as awaiting approval. `Glob` SHALL list matching files ordered by path.

#### Scenario: A note is read with line numbers and a range
- **WHEN** `Read` is called for `work/a.md` with offset 3 and limit 2
- **THEN** it returns lines 3 and 4 of that note, each with its line number

#### Scenario: A path outside what may be read is refused
- **WHEN** `Read` is called for `contexture.yaml`, for a derived file, or for `../outside.md`
- **THEN** the call is refused and no content is returned

#### Scenario: A member reads their session's uncommitted version
- **WHEN** a member who edited `<root>/work/a.md` in their session calls `Read` for it
- **THEN** the session's working-tree version is returned, while `Read` of `work/a.md` returns the served commit's version

#### Scenario: A pattern is matched in path order, with pending captures listed
- **WHEN** `Grep` is called with `kest(rel)?` in content mode, two notes match, and an inbox file on a session branch with an open pull request matches
- **THEN** the notes' matching lines are returned ordered by path and line with no score, the inbox file is listed apart as awaiting approval, and no excluded file appears

#### Scenario: A template is readable
- **WHEN** `Read` is called for a file under the store's template path
- **THEN** its content is returned

#### Scenario: A catalog section file is readable in a session
- **WHEN** a member calls `Read` for a section file under the catalog path inside their session
- **THEN** its content is returned, so the gloss on a note's line can be edited there, while a derived file under the same tool-owned folder is still refused

#### Scenario: A published page is readable though its location is excluded from retrieval
- **WHEN** the published-pages location lies under a retrieval exclusion and a member calls `Read` for a page's `index.html` there, or `Glob` for the location's files
- **THEN** the page's text is returned and its files are listed, while `find` and `gather` still return no published page

## ADDED Requirements

### Requirement: A page is scaffolded and stamped in a session through `ctxr_write`
`ctxr_write`'s allowlist SHALL include `publish new` and `publish stamp`, run in the calling member's own session with the same argument vector and exit codes as in a shell, under every rule `ctxr_write` already applies. The enforcing mechanism is the runner's allowlist check, which refuses before anything runs, and the tool/command alignment test, which reads the same allowlist.

#### Scenario: A disposable page is scaffolded in a session
- **WHEN** a member calls `ctxr_write` with `["publish", "new", "--disposable", "weekly-review"]` naming their session
- **THEN** the session gains the dated disposable page folder and its README under the published-pages location, and the result carries exit code `0` and the page's preview address

#### Scenario: A page is not scaffolded outside a session
- **WHEN** a member calls `ctxr_write` with `["publish", "new", "work/decision-board"]` and no session
- **THEN** the call is refused and nothing runs

#### Scenario: A page is stamped in a session
- **WHEN** a member calls `ctxr_write` with `["publish", "stamp", "<page path>"]` naming their session, for a permanent page whose README leads with its note
- **THEN** the README's lead-link line carries that note's hash, and `ctxr` with `["publish", "check", "<page path>"]` in the same session reports no `represented-note-hash` failure
