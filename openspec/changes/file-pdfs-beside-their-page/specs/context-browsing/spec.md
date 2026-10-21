## ADDED Requirements

### Requirement: A published PDF is served as a PDF
A request under the publish route, or under a session worktree's preview route, that names a file
ending in `.pdf` SHALL be answered with the content type `application/pdf`, so a browser displays it
in place rather than downloading it. The body SHALL remain byte-identical to the file on disk, as
for every published file.

#### Scenario: A page's PDF opens in the browser
- **WHEN** a `GET` request names `2026-01-15-brief.pdf` in a published page's folder
- **THEN** the response is `200` with content type `application/pdf`, and its body is
  byte-identical to the file

#### Scenario: A previewed PDF is served the same way
- **WHEN** a `GET` request names a PDF in a page folder held in a session worktree, under that
  worktree's preview route
- **THEN** the response carries content type `application/pdf`
