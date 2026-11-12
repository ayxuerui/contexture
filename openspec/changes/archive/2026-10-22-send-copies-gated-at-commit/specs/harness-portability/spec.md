## MODIFIED Requirements

### Requirement: The publish skill files a page's send copies beside its index page, dated, and keeps a source file beside its note
The rendered `ctxr-publish` skill SHALL name the send-copy formats (`.pdf`, `.docx`, `.xlsx`,
`.pptx`) and instruct that a send copy — a file built from the note and sent to someone — is written
directly into the page's folder, beside its `index.html`, under a file name led by the date it was
made; that a send copy is never a page on its own, so a document sent in any of these formats still
has an `index.html`; that a file the page uses as an input belongs in the page's `assets/`, not at
the folder root; and that making a send copy of a changed page writes a new dated file and leaves
every earlier one untouched, because an earlier file may be what a recipient was sent. It SHALL
instruct that an office file which is itself the source — edited by hand and not built from any
note — is kept in the note tree beside the note that describes it, undated, and is not published,
and that a dated copy of it sent to someone is a send copy. It SHALL state that the commit is refused when it adds an undated send copy or changes a send copy
already committed. It SHALL name how a send copy is produced
as the store's choice, and SHALL NOT name a renderer contexture ships. The enforcing mechanism is the
test over the rendered skill set.

#### Scenario: A send copy is filed beside the index page with its date
- **WHEN** an agent follows the publish skill to produce a spreadsheet send copy of a page
- **THEN** it is instructed to write it at the page folder's root, beside `index.html`, under a file
  name led by the date it was made

#### Scenario: A new send copy keeps the earlier one
- **WHEN** an agent follows the publish skill to produce a send copy of a page that already holds one
- **THEN** it is instructed to write a new dated file and to leave the earlier file unchanged

#### Scenario: An input stays in assets
- **WHEN** an agent follows the publish skill for a page that uses a file it did not produce
- **THEN** it is instructed to place that file in the page's `assets/`

#### Scenario: A hand-edited workbook stays beside its note
- **WHEN** an agent follows the publish skill for a workbook that is edited by hand and built from
  no note
- **THEN** it is instructed to keep the workbook beside the note that describes it, undated, and not
  to publish it, and to file any dated copy sent from it as a send copy

#### Scenario: The skill names the commit gate
- **WHEN** an agent follows the publish skill to produce a send copy
- **THEN** it is told that a commit adding an undated send copy, or changing one already committed, is
  refused
