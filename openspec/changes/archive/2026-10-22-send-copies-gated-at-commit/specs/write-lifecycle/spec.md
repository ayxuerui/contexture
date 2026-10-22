## MODIFIED Requirements

### Requirement: Commits are validated before they are accepted
The store SHALL install a version-controlled pre-commit hook that runs a staged-changes validation (schema conformance, fence integrity, a secret-pattern scan, a path allowlist, a diff-size ceiling, and the send-copy rule) and refuses the commit if any check fails, naming the specific violation.

The diff-size ceiling SHALL count the changed lines of every staged file except a file under the configured skills path whose staged content is byte-identical to the content the installed version ships for that path — an owned skill's `SKILL.md`, an owned skill's supporting file, or a packaged file of a vendored skill the store declares. The exemption SHALL be decided by comparing the staged content with the shipped content, never by location alone: a file under the skills path that differs from what the installed version ships, a file the installed version does not ship, an operator-authored skill, and a deletion SHALL all be counted as before. When the exemption applies to any staged file, the ceiling's finding SHALL state how many changed lines were left out of the count.

The pre-commit hook SHALL locate the `contexture` executable it runs from its own runtime environment — an explicit override read from a `CONTEXTURE_*` environment variable if set, otherwise the executable resolved on `PATH` — and SHALL NOT have any installation-specific filesystem path baked into it at install time, so the installed hook is byte-identical regardless of which machine or checkout installed it. When neither the override nor `PATH` resolves an executable, the hook SHALL refuse the commit, naming what to fix, rather than allowing the commit to proceed unvalidated.

#### Scenario: A schema violation blocks the commit
- **WHEN** a staged note violates the store's frontmatter schema
- **THEN** the pre-commit hook refuses the commit and names the violation

#### Scenario: A clean commit proceeds
- **WHEN** all staged changes pass every pre-commit check
- **THEN** the commit proceeds normally

#### Scenario: A checkout without the executable has its commit refused
- **WHEN** a commit is attempted in a checkout where no `CONTEXTURE_*` override is set and no `contexture` executable is found on `PATH`
- **THEN** the pre-commit hook refuses the commit and names what to install or set to fix it, instead of allowing the commit to proceed unvalidated

#### Scenario: A fresh store's first commit is not refused for the skills it ships
- **WHEN** `ctxr init` stages a new store whose skill files alone exceed the configured ceiling
- **THEN** the pre-commit hook accepts the commit, because those files are byte-identical to what the installed version ships and are not counted

#### Scenario: A shipped skill file edited by one byte is counted
- **WHEN** a staged file under the skills path differs from the content the installed version ships for that path by any amount
- **THEN** its changed lines count toward the ceiling in full

#### Scenario: A file the installed version does not ship is counted wherever it sits
- **WHEN** a staged file under the skills path, or inside an owned skill's directory, is not one the installed version ships
- **THEN** its changed lines count toward the ceiling in full

#### Scenario: Other staged content still reaches the ceiling
- **WHEN** a commit stages enough operator-authored or agent-authored lines to exceed the ceiling, alongside shipped skill files
- **THEN** the pre-commit hook refuses it, and the finding names how many lines were left out of the count

#### Scenario: A deletion is counted
- **WHEN** a commit stages the removal of a skill file
- **THEN** the removed lines count toward the ceiling as they did before

## ADDED Requirements

### Requirement: A commit cannot add an undated send copy or change one already committed
A send copy is a file whose name ends in `.pdf`, `.docx`, `.xlsx` or `.pptx`, compared without regard to
case, directly inside a page folder under the store's configured publish path — a folder holding the page's
`index.html` in the commit's resulting tree — as the publish capability defines it. The pre-commit validation
SHALL include a send-copy check that fails, naming each file:

- as `staged.send_copies.undated`, for each staged send copy that is added — or renamed into a page folder —
  whose name is not `<YYYY-MM-DD>-<name>.<extension>` led by a real calendar date and a non-empty name;
- as `staged.send_copies.modified`, for each staged send copy whose content differs from the content it
  had in the commit's parent, whether changed in place or changed as part of a rename.

It SHALL NOT fail for the deletion of a send copy, for a rename that leaves a send copy's bytes unchanged
and keeps a dated name, or for any file in a subfolder of a page folder. Its finding SHALL state that a new
send is written as a new dated file. The enforcing mechanism is the pre-commit hook, which refuses the commit
when this check fails.

#### Scenario: An undated send copy is refused
- **WHEN** a commit stages `brief.pdf` added beside a page's `index.html`
- **THEN** the pre-commit hook refuses the commit, naming `staged.send_copies.undated` and the file

#### Scenario: A dated send copy is accepted
- **WHEN** a commit stages `2026-01-15-brief.pdf` added beside a page's `index.html`
- **THEN** the send-copy check passes

#### Scenario: A changed send copy is refused
- **WHEN** a commit stages new content for `2026-01-15-brief.pdf`, already committed in a page folder
- **THEN** the pre-commit hook refuses the commit, naming `staged.send_copies.modified` and the file, and
  says to write a new dated file instead

#### Scenario: A send copy moved unchanged is accepted
- **WHEN** a commit renames `2026-01-15-brief.pdf` from one page folder to another, or into a page folder
  from elsewhere in the store, without changing its bytes
- **THEN** the send-copy check passes

#### Scenario: A send copy renamed and changed is refused
- **WHEN** a commit renames a committed send copy and also changes its bytes
- **THEN** the pre-commit hook refuses the commit, naming `staged.send_copies.modified`

#### Scenario: A deleted send copy is accepted
- **WHEN** a commit removes a page folder, its send copies with it
- **THEN** the send-copy check passes

#### Scenario: A file in a page's assets is not a send copy
- **WHEN** a commit stages a changed `assets/kickoff.pdf` in a page folder
- **THEN** the send-copy check passes
