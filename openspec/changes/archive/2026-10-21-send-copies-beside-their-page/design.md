## Context

`file-pdfs-beside-their-page` (archived 2026-10-20) added, in `src/commands/publish-check.ts`, a
`pdfsAtPageRoot` reader, a `checkPdfNames` check with id `pdf-name`, a `pdfs` data field, and a
`.pdf` path argument that redirects to the folder's `index.html`; and in `src/commands/serve.ts` one
`application/pdf` entry in `CONTENT_TYPES`. All four turn on one literal, `.pdf`. Its design D1–D3
(sibling of `index.html`, dated file name, folder root versus subfolder) carry over unchanged; this
change widens what they apply to.

## Goals / Non-Goals

**Goals:**
- One list of send-copy extensions that the check, the listing, the path redirect and serve all read,
  so adding a format later is one edit.
- Every behaviour the PDF rule had, unchanged for PDFs.

**Non-Goals:**
- Telling a hand-edited source workbook from a send copy by inspecting the file. The proposal
  declines it; nothing here reads file contents.

## Decisions

### D1. A closed list of four extensions

`SEND_COPY_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx']`, matched on the lower-cased extension.

*Alternative considered: any file at the page root that is not part of the web page* — everything
except `.html`, `.css`, `.js`, `.json`, images and fonts. The best case for it: the rule is about
what a file *is for* (sent, kept), not its format, so a format list will always be one short; a
`.key`, `.odt` or `.zip` bundle sent to someone deserves the same protection. It is also not refuted by
today's stores: no page folder in pkm, readyrun-brain or bambi holds anything at its root but web
files and its README, so it would fail nothing on upgrade either.

It loses on which way each rule errs. A closed list that misses a format leaves that file unchecked —
the state every office file is in before this change. An exclusion list that misses a format fails a
page over a file nobody sent: the first `.csv` a page script reads, a `.geojson`, a `.wasm`, a `.mp4`
for an explainer. Its list of exceptions would grow with what pages do, which nobody can enumerate;
the list of formats a recipient asks for is short and changes slowly. A missing format is one entry.

*Alternative considered: a config key listing the formats.* A store choosing its own send formats is
plausible, but the four cover both downstream stores, and an opt-in key with no default would leave
the check off everywhere it isn't declared.

### D2. Rename the check and the field now, without an alias

`pdf-name` → `send-copy-name`; `pdfs` → `send_copies`; `pdfsAtPageRoot` / `checkPdfNames` →
`sendCopiesAtPageRoot` / `checkSendCopyNames`.

*Alternative considered: keep `pdf-name` and `pdfs`.* The best case: they shipped in a release, the
check id is part of `publish check`'s output contract, and a rename is churn for a one-day-old name;
"pdf" is a fair shorthand for "printed document". It loses at the point of use: an agent reading
`pdf-name: "model.xlsx" is not named …` has to know the history to trust it, and the field `pdfs`
listing a spreadsheet reads as a bug. 0.26.0 has been out a day; the only shipped text naming either
is the `ctxr-publish` skill, re-rendered by this change; no store file, hook or script reads them.
The cost of renaming only grows from here.

*Alternative considered: rename, and keep the old names as aliases for a release.* Two spellings of
one thing in the output, with no consumer to protect.

### D3. "Send copy", not "rendering" or "export"

The noun names what the file is for. "Rendering" collides with the HTML page itself, which is also a
rendering of the note. "Export" suggests a command that produces it, and contexture has none. pkm's
own notes already call these files "send copy".

### D4. Serve takes the registered Office types

The three `application/vnd.openxmlformats-officedocument.*` types. Browsers do not display them
inline, so the effect is a download under the right type and a sensible default application, instead
of `application/octet-stream`. No `Content-Disposition` header, as for PDFs.

### D5. The source-file rule is skill prose only

Where a hand-edited workbook goes is decided by how it was made, which the files cannot show (the
proposal's non-goal). The rule lives in `ctxr-publish`, because that is where an agent deciding
"should this file be published" is reading. It is phrased as what not to publish, so the skill does
not grow a second subject.

## Risks / Trade-offs

- **[A page already holds an undated `.docx`, `.xlsx` or `.pptx` at its root]** → it newly fails
  `send-copy-name`. Checked before writing this: no page folder in pkm, readyrun-brain or bambi holds
  one, so no page fails on upgrade.
- **[A hand-edited workbook is published by mistake]** → it passes the check if dated, and lands in a
  folder search skips. The reviewed pull request shows a binary added under the publish path; the
  skill's rule is what prevents it.
- **[Binary files grow the repository]** → unchanged from the PDF rule, and the reason the skill says
  to make a send copy only when one is sent.

## Migration Plan

Contexture side: none beyond the rename, which the re-rendered skill carries. Ship in a release;
rollback is reverting it.

Store side, after the release: pkm's migration PR moves `artifacts/exports/`'s PDFs and its `.docx`
into page folders with dated names in one pass, keeps or adds each page's `index.html`, relinks the
notes that cite the old paths, points its document skill at the page folder, and removes
`artifacts/`.
