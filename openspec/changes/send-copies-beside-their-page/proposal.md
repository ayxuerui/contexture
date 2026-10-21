## Why

`file-pdfs-beside-their-page` (0.26.0) gave a page's PDF one home: a dated file beside its
`index.html`. The rule names one format, but the reason behind it does not depend on the format. A
copy built from a note and sent to someone is a record of what went out on a day, whether it is a
PDF, a Word document, a spreadsheet or a slide deck. pkm already holds a `.docx` built this way
(`artifacts/exports/2026-10-19-VertexFlow-Option-Letter-Response.docx`), and Excel deliverables are
coming. With the rule as shipped, those files either stay outside the publish path or sit in a page
folder unchecked.

A second kind of office file needs the opposite answer. A workbook edited by hand — a financial
model with formulas — is not built from any note; it is the source, and the note describes it.
Publishing it would put a source where retrieval does not look and point the staleness check the
wrong way. Nothing says where such a file goes today.

## What Changes

- **A send copy is any of four formats.** A file directly in a page folder ending in `.pdf`, `.docx`,
  `.xlsx` or `.pptx` is a send copy of that page, held to the same rule a PDF is held to now: a file
  name led by a real date, `<YYYY-MM-DD>-<name>.<ext>`. The same file in a subfolder stays an input.
- **BREAKING (output only): the check and the field take format-neutral names.** `pdf-name` becomes
  `send-copy-name`, and `ctxr publish check`'s `pdfs` field becomes `send_copies`. A check named for
  PDFs failing on a spreadsheet misreads at the point it is read. Both names shipped one release
  ago in 0.26.0; no store's own files reference either, and the only shipped text that does is the
  `ctxr-publish` skill, which this change re-renders.
- **`ctxr serve` sends each format with its own content type.** `.docx`, `.xlsx` and `.pptx` gain
  their Office content types beside the existing `application/pdf`, so a browser offers the file
  as what it is instead of an unnamed binary.
- **The publish skill says which office files are published and which are not.** A send copy, built
  from the note, sits beside the page's `index.html`, dated, and is never replaced. A file that is
  itself the source — edited by hand, regenerable from nothing — stays in the note tree beside the
  note that describes it, undated, with its history in git, and is not published; a dated copy of it
  sent to someone is a send copy like any other. A file received from someone else stays where the
  store files captures.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `publish`: the PDF filing requirement is replaced by one covering every send-copy format, under
  the format-neutral check and field names.
- `context-browsing`: the PDF content-type requirement is replaced by one covering every send-copy
  format.
- `harness-portability`: the publish skill's PDF requirement is replaced by one covering every
  send-copy format and stating where a source office file goes instead.

## Non-goals

- **No open-ended list of formats.** The four are the office formats a recipient asks for. A wider
  rule — any file at a page root that is not part of the web page — would fail a page over the first
  data file its script reads (a `.csv`, a `.geojson`) or media it shows, files nobody sent. Missing a
  format leaves a file unchecked, as every office file is today; adding one later is one entry in one
  list.
- **No check on source office files in the note tree.** Whether a workbook beside a note is a hand
  edited source or a stray send copy is a judgment about how it was made; the files cannot show it.
  The skill states the rule.
- **No legacy formats** (`.doc`, `.xls`, `.ppt`). Nothing in either downstream store produces them,
  and each would be one more entry if one ever did.
- **No alias for the old names.** Keeping `pdf-name` and `pdfs` alongside the new names would carry
  two spellings of one thing for a release that had no consumers yet.
- **No migration of any store's files.** pkm's `.docx` and PDFs move in the store's own pull request,
  which this change lets cover every format in one pass.

## Impact

- `src/commands/publish-check.ts`: the four-format list, the renamed check and field.
- `src/commands/serve.ts`: three content types.
- `templates/skills/ctxr-publish.md`: step 8's PDF paragraphs widened to send copies, plus the
  source-file rule; step 6's check list and step 4's naming note follow the rename.
- `test/unit/publish-check-command.test.ts`, `test/integration/serve-command.test.ts`,
  `test/unit/skills.test.ts`: the existing PDF cases kept under the new names, plus one per new
  format.
- Downstream: pkm's migration PR can move `.pdf` and `.docx` together after a release carrying this.
