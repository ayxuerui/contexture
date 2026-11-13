## MODIFIED Requirements

### Requirement: `Read`, `Grep` and `Glob` read the served commit or a member's own session
The surface SHALL offer `Read`, `Grep` and `Glob` with the names and parameters of Claude Code's own tools. Paths SHALL be store-relative, a leading `/` naming the store root. A path under the root of a session the calling member owns SHALL read that session's working tree; any other path SHALL read the commit being served. A path that leaves the store root, or lies under the store's retrieval exclusions, its configuration file, its derived paths or `.git`, SHALL be refused or never returned; the store's templates, catalog section files, house conventions, log and skills SHALL be readable. `Read` SHALL return file text numbered from 1 with an optional offset and limit and at most 2,000 lines per call, marking a capture as one. `Grep` SHALL match a regular expression with Claude Code's Grep parameters, ordered by path, with no score, within a fixed time and output bound, and when reading the served commit SHALL also list matching inbox files of session branches with an open pull request, marked as awaiting approval. `Glob` SHALL list matching files ordered by path.

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
