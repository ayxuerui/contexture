## REMOVED Requirements

### Requirement: A published PDF is served as a PDF
**Reason**: Replaced by "A published send copy is served with its format's content type", which
covers `.docx`, `.xlsx` and `.pptx` as well as `.pdf`.
**Migration**: None. A PDF is served exactly as before.

## ADDED Requirements

### Requirement: A published send copy is served with its format's content type
A request under the publish route, or under a session worktree's preview route, that names a file
ending in `.pdf`, `.docx`, `.xlsx` or `.pptx` SHALL be answered with that format's registered content
type: `application/pdf`; `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; and
`application/vnd.openxmlformats-officedocument.presentationml.presentation`, respectively. The body
SHALL remain byte-identical to the file on disk, as for every published file.

#### Scenario: A page's PDF opens in the browser
- **WHEN** a `GET` request names `2026-01-15-brief.pdf` in a published page's folder
- **THEN** the response is `200` with content type `application/pdf`, and its body is
  byte-identical to the file

#### Scenario: An office send copy carries its own content type
- **WHEN** a `GET` request names `2026-01-15-model.xlsx` in a published page's folder
- **THEN** the response is `200` with the spreadsheet content type above, and its body is
  byte-identical to the file

#### Scenario: A previewed send copy is served the same way
- **WHEN** a `GET` request names a `.docx` send copy in a page folder held in a session worktree,
  under that worktree's preview route
- **THEN** the response carries the word-processing content type above
