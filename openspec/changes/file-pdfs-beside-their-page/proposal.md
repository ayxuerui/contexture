## Why

A store that sends documents as PDFs has no place for them in the publish path. pkm keeps two
homes: thirteen rendered sends in a hand-made `artifacts/exports/` folder, outside the publish
path, and a few more inside page folders' `assets/` beside the inputs those pages use. Nothing
checks either, `ctxr serve` hands a PDF over as `application/octet-stream` so a browser downloads it
instead of showing it, and a PDF in `artifacts/exports/` is not tied to the note it renders, so the
page staleness check that now covers every permanent page says nothing about it.

The publish path already has everything a PDF needs except the rule for where it goes: a page folder
filed under its note, a README naming the note it represents, a stamped hash that reports the page
stale when that note changes, and a print rule every page must declare. A PDF is that page printed.

The send is also a record. A resignation notice or a counsel brief is what went out on a given day,
and re-rendering it after the note moves on must not replace what the recipient holds. Pages are
living and refuse a date-led folder name, so the date has to ride on the file, not the folder.

## What Changes

- **A page's PDF sits at the root of its page folder, beside `index.html`.** A PDF file directly in
  a page folder is a printed rendering of that page. A PDF under the page's `assets/` stays what it
  is today: an input the page uses, not a rendering of it, and unchecked.
- **Its file name leads with the date it was rendered.** `<YYYY-MM-DD>-<name>.pdf`, with a real
  date. `ctxr publish check` fails a page that holds a PDF at its folder root without one, as a new
  named check, `pdf-name`, reported in the same run as every other check.
- **A re-render adds a file; it never replaces one.** The publish skill instructs rendering a new
  dated PDF when a page changes and keeping every earlier one, so what was sent stays as sent. A
  page's staleness is unchanged: it is the page's, read from its README stamp, and covers its PDFs
  because they are renderings of it.
- **`ctxr publish check` reports the page's PDFs.** Its machine-readable output names each PDF at
  the page folder's root with the address `ctxr serve` answers for it, and its human summary counts
  them, so the author can hand on a link to the PDF rather than to the page.
- **`ctxr serve` serves a PDF as `application/pdf`**, under both the publish route and a session
  worktree's preview route, so a browser opens it in place.
- **The publish skill says where a PDF goes.** The rendered `ctxr-publish` skill states the rule
  above, distinguishes a page's own PDF from an input in `assets/`, and leaves how the PDF is
  produced to whatever the store uses (a print of `index.html`, or the store's own document
  pipeline that keeps its styled HTML as `index.html`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `publish`: adds a requirement that a page's PDF renderings sit at its folder root under a dated
  file name, checked by `ctxr publish check` and reported in its output.
- `context-browsing`: adds a requirement that a published PDF is served with the PDF content type,
  under the publish route and the preview route alike.
- `harness-portability`: adds a requirement that the rendered publish skill files a page's PDF
  beside its index page, dated, never replacing an earlier one.

## Non-goals

- **A PDF is never a page on its own.** A folder holding a README and a PDF but no `index.html` is
  not a page, as today: navigation, `ctxr publish urls`, lint's staleness listing and `ctxr publish
  check` all identify a page by its index file, and widening that definition would change all four
  for a case the store's PDF pipeline does not need — it builds a styled HTML page before printing
  it, and keeping that page as `index.html` is a smaller step than teaching every page reader a
  second entry point.
- **contexture does not render PDFs.** The memo-style documents (cover page, page footers, styled
  tables) are one store's document style, built by a store-owned skill. Shipping a renderer would
  make a headless browser and a document template part of contexture for one store's taste. The
  page's required print rule keeps "print `index.html`" available to every store without one.
- **No check that a sent PDF was not overwritten.** Whether a dated file's bytes changed is a
  question about history, not about the files `ctxr publish check` reads; the reviewed pull request
  is where a modified PDF shows, and the skill states the rule.
- **No navigation entry for a PDF.** The browsing surface lists pages, and a page's own HTML is
  where its PDFs are linked from. Adding PDFs to the folder navigation is a separate change if
  wanted.
- **No migration of any store's existing PDFs.** Moving pkm's `artifacts/exports/` files into their
  page folders, and relinking the notes that cite them, is store content and lands in the store's
  own pull request after this ships.

## Impact

- `src/commands/publish-check.ts`: the `pdf-name` check and the reported PDF list; accepts a PDF at a
  page folder's root as its path argument by checking that folder's `index.html`.
- `src/core/publish/lifespan.ts`: the leading-date parser is shared by the disposable shape and the
  PDF name, under a name that reads right at both.
- `src/commands/serve.ts`: the `.pdf` content type.
- `templates/skills/ctxr-publish.md`: the filing rule for a PDF.
- `openspec/specs/publish`, `openspec/specs/context-browsing`, `openspec/specs/harness-portability`:
  one added requirement each.
- Downstream: pkm can move its PDFs once, after a release carrying this change.
