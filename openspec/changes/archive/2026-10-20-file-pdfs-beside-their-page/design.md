## Context

Everything that reads published pages identifies one by its index file. The serve route table
collects pages as the directories holding `index.html` (`pagesFromPublishFiles`); `ctxr publish
urls` reports a change set's pages by that file; lint's staleness and disposable-window listings
walk the same set; `ctxr publish check` takes the index page's path. Staleness is already folder
level: `ctxr publish stamp` writes the hash marker into the README, and `assessRepresentation` reads
it, without looking at any other file in the folder.

The serve route table already publishes every file under the publish path, PDFs included, byte for
byte. `contentTypeFor` has no `.pdf` entry, so those files go out as `application/octet-stream`.

The leading-date reader, `parseDisposableDate`, already rejects a date the month does not have. It
is used by the disposable-shape check and by lint's disposable-window listing.

## Goals / Non-Goals

**Goals:**
- A store can move every PDF it renders into the page folder it renders, once, with nothing about
  the move left for a later release to change.
- No reader of pages changes its idea of what a page is.

**Non-Goals:**
- Telling whether a folder holding dated PDFs but no index page was meant to be a page. That is the
  case the proposal declines, and a check for it would be the first place the tooling reasons about
  a non-page folder.

## Decisions

### D1. A PDF is a sibling of `index.html`, never a page on its own

A page stays "a folder holding `index.html`". A PDF at that folder's root is a rendering of the page.

*Alternative considered: a folder holding a README and a dated PDF is a page.* The best case for it:
a memo is a document, not a web page, and asking for an `index.html` beside it adds a file nobody
opens, which must still pass the HTML checks (provenance line, title, viewport, print rule). It
would also let a store move a PDF it has no HTML for — a scan, an export from another tool — into
the publish path unchanged.

It loses on cost and on need. Four readers (the route table, `publish urls`, lint's listings,
`publish check`) would each need a second entry point and a rule for which file the navigation
links when there are several PDFs; the per-page `served_at` would have to pick one. The one store
with PDFs builds every one of them from a styled HTML page it currently throws away, so keeping that
page is a smaller step than all four changes. A PDF with no source HTML is not a rendering of a page,
and it already has a home as an input in a page's `assets/`. If a second store turns up with PDFs
that have no HTML, this decision can be widened then without moving any file this change puts in
place: a dated PDF at a page folder's root stays where it is.

### D2. The date rides on the file name, not the folder

`<YYYY-MM-DD>-<name>.pdf`, checked by a new `pdf-name` check.

*Alternative considered: undated PDFs, one per page, overwritten on re-render, with history in git.*
That is the living-page model applied to the PDF, and it is how `index.html` itself behaves. It
loses because a PDF, unlike a page, leaves the store: it is attached to an email, and the recipient
holds that file. A link to a page always shows the current page, which is what the link means; a
sent PDF is a statement of what was said on a day. Keeping the earlier file beside the new one makes
"what did I send" answerable by listing the folder, where git history would need the send date
remembered elsewhere.

*Alternative considered: a dated subfolder per render (`renders/2026-01-15/brief.pdf`).* It keeps
file names clean but adds a level a reader has to open, and a PDF under a subfolder is exactly what
D3 calls an input.

The folder-name rule for living pages binds the page's own folder segment only, so a dated file name
inside a living page's folder does not conflict with it.

### D3. Root of the page folder means rendering; anywhere below means input

pkm already has PDFs in `assets/` that are inputs (a hackathon kickoff deck a page summarises) and
PDFs in `assets/` that are the page's own rendering (an entity-formation memo). Position is the
only distinction the tooling can read without a field, and the folder root is the place `index.html`
already sits. The migration moves the second kind up a level and leaves the first kind alone.

### D4. The leading-date reader is shared under a name that reads at both uses

`parseDisposableDate` becomes `parseLeadingDate` in `src/core/publish/lifespan.ts`. A PDF name check
calling a function named for disposable pages would read as a mistake at the point of use. The
behaviour (real date, followed by at least one character) is the same for both, so it stays one
function. The PDF check strips the `.pdf` extension before calling it, so `2026-01-15-.pdf` and
`2026-01-15.pdf` both fail for lacking a name.

### D5. `publish check` lists PDFs and accepts one as its argument

The check's data gains `pdfs: { path, served_at }[]`, sorted by file name, which is date order for
well-named files. The author's next move after rendering is to hand a link on, and the PDF's address
is not otherwise printed anywhere. A PDF path argument resolves to its folder's `index.html` so that
"check the thing I just rendered" works without the author translating the path; the existing
not-found error covers a folder with no index page. Neither changes the exit code.

*Alternative considered: a separate `ctxr publish pdfs` listing.* A second command for one field of
one page's state, when `publish check` is already the command that reports a page's address.

### D6. Serve gains one content type and nothing else

`'.pdf': 'application/pdf'` in the shared table, which both the publish and preview routes read. No
`Content-Disposition` header: browsers display `application/pdf` inline by default, and the
byte-verbatim requirement already rules out any wrapping.

## Risks / Trade-offs

- **[A sent PDF can still be overwritten by hand]** → the skill states the rule, and a modified
  binary shows in the reviewed pull request's file list. `publish check` reads files, not history,
  so it cannot tell; this is the gate-not-cage line the project draws everywhere.
- **[Dated PDFs accumulate in a page folder]** → expected and wanted for sends; a page re-rendered
  often for internal reading should not be rendered to PDF each time. The skill says a PDF is made
  when one is sent, not on every page edit.
- **[A store keeps PDFs in a folder with no `index.html`]** → it is not a page, gets no checks, and
  navigation does not show it — the same as today's `artifacts/exports/`, no worse. The skill's rule
  that a PDF always has an index page is what prevents it.
- **[The store's document pipeline must now keep a check-passing HTML page]** → it already renders
  one before printing; the cost is adding the provenance line, viewport meta and title to its
  template once.

## Migration Plan

No contexture-side migration: no existing page holds a PDF at its folder root, so no page newly fails
`pdf-name` on upgrade. (pkm's two page-owned PDFs sit under `assets/`, which the check ignores.)

After a release carrying this change, the store moves each rendered PDF into its page folder under a
dated name, keeps or adds the page's `index.html`, relinks the notes that cite the old path, points
its document skill's output at the page folder, and removes `artifacts/`. That is store content in
the store's own pull request. Rollback is reverting the release; the PDFs remain servable files under
the publish path either way.
