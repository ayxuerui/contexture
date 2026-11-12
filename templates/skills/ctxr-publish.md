Turn store content into a shareable HTML page for a subject — a store subtree, a single note, or a
concept whose sources aren't co-located. Deciding what belongs on the page is the one step no
convention can enforce for you; everything else here is a decision procedure, not a mechanism.

## 1. Permanent or disposable? Decide first

Decide the page's lifespan before you do anything else. A page has one of two lifespans:

- **Permanent.** The page is the rendered form of one note that will keep changing. Keep it, and
  update it when the note changes.
- **Disposable.** The page helps somebody understand something once. Examples are an explainer, a
  report on one week of agent work, or a comparison for one decision. Nobody updates it.

Choose disposable when you cannot name the one note that the page represents. Why: a kept page that
names no note holds facts that live nowhere else, and nothing can tell when they go out of date.

The location of the page sets its lifespan. Nothing in the page declares it. A disposable page sits
under `disposable/` directly below the store's published-pages location. Every other page is
permanent.

For a permanent page, make sure that the page earns its place over a note. Use a page when the reader
must compare options side by side, see spatial structure, manipulate something, navigate
non-linearly, or open a link. Use it only when the store's own notes cannot do this. Why: a page
costs several times the effort of the markdown it comes from. If a note does the job, the note is the
deliverable. Do not apply this test to a disposable page. Why: a disposable page is cheap on purpose,
and it is the cheap way to understand something once.

## 2. Name the subject, let the selector produce the set

`ctxr publish gather` resolves a subject to its source notes — never a hand-picked list, which is how
an unintended note slips in unnoticed:

- `--under <prefix>` — a store subtree
- `--note <path>` — a single note
- `--entity <name>` — every note linking to a concept, the same enumeration `ctxr rollup gather` uses

It answers where the page belongs as well as what it is drawn from: the path it reports is what step
4 files the page at, so run it once and keep the output.

## 3. Decide what belongs on the page

The store does not decide this for you. Read the resolved set and judge, note by note, whether its
content belongs in front of this page's intended readers — a page written for an outside party must
not carry material written about that party, or about anyone else who did not expect to be quoted.
When you are unsure about a note, leave it out and name it to the operator rather than guessing.

## 4. Fix the identity once

**A disposable page.** Run `ctxr publish new --disposable <name>`. The command creates the folder
`disposable/<YYYY-MM-DD>-<name>` with today's date, and its sibling README. Give the name alone. Why:
the command supplies the date, and it refuses a name that starts with one. Do not use the path that
`gather` reported. Why: disposable pages sit in one flat folder, sorted by date, not by subject.

**A permanent page.** Step 2 reported the path at which a page for this subject belongs. That path is
under the store's published-pages location, and comes from where the subject's notes live.
Take it verbatim, append the page's own name, and give the result to `ctxr publish new <slug>`. The
command creates the folder and its sibling README:

```sh
ctxr publish new <reported path>/<page-name>
```

The depth is the store's own, not a fixed number of levels. A subject whose notes are four folders
deep gets a page four folders deep. Why: then the published-pages navigation reads like the store, not
like one long list. `ctxr publish check` fails a page filed flat at the published-pages root. It
checks nothing more about the location. Why: `gather` already answered which folder is correct.

Name the page for what it *is*, never for its subject. Why: the folders above it already name the
subject. `<reported path>/<subject>` says one word two times, and `<reported path>/decision-board`
says something.

Sometimes `gather` reports that an existing page also belongs at the reported path. This subject then
gets a second page, and the pages of a subject collect under one folder that names it. Move that page
there before you create the new one, and tell the operator its URL changed. Why: somebody can already
have that link. `ctxr publish urls` reports the old address next to the new one, and `ctxr-submit`
puts both into the pull request. `gather` moves nothing. It names the signal that counted the page as
this subject's page. Read that signal before you move anything. Why: the signal is a reading of the
page's README, and it can be wrong.

Lead a page's source notes with the note it is a representation of. `ctxr publish check` fails a
permanent page whose README does not start with a wikilink to exactly one note. For a page that comes
from a store folder, that note is the folder's hub note. If the folder has no hub note, write one, or
make the page disposable. The page can link to many more notes after the lead link. Why: the lead link
says which note the page represents, and each link after it is a citation.

After you write the README, run `ctxr publish stamp <path>`. The command records the represented
note's hash on the lead-link line. Why: `ctxr publish check` then reports the page as stale when that
note changes.

Sometimes `gather` reports that no path derives. One reason is that the subject is the store root, so
no folder names it. The other reason is that the path would start with `disposable/`, a segment that
only disposable pages can use. Then you choose the folder, and you own that choice. Pick the folder
that best names the subject to the reader.
Then write that choice and your reason into the page's README, and tell the operator. Nothing checks
this choice. Why: a page filed under a word that names nothing helps no reader.

Never start the page's own name with a date (`YYYY-` or `YYYY-MM-DD-`). That naming is reserved for
the frozen pages that `ctxr publish new --disposable` makes. The rule applies to the final segment, not
to the folders above it. It does not apply to a send copy in the page's folder, which starts with
the date you made it (step 8). The command refuses to overwrite an existing folder. If a folder already
exists for this subject, edit its files directly. Do not run `publish new` again. Why: a rename or an
overwrite breaks a link that somebody already has.

## 5. Choose the form, then delegate the craft

Pick the shape the content actually needs — a status board, a timeline, a side-by-side comparison, an
explainer with a live demo — not a rendering of the source notes in reading order. Contexture ships no
renderer of its own and no house voice: both halves of the craft are delegated to a skill.

**The form and its visual language.** Load the `frontend-design` skill this store carries by default
(or whichever design-focused skill it's configured or installed instead) and follow it for the HTML,
CSS, type, and palette — and for the interface's own words: labels, buttons, empty and error states.
If a sibling page already exists, read its stylesheet and inherit its palette and type scale before
inventing a new one.

**The prose that explains the subject.** A page is read by someone who wasn't in the sessions the
notes came from, so the notes' shorthand does not survive the copy out. Load the `eli5` skill this
store carries by default (or whichever explanation-focused skill it's configured instead), settle who
the reader is before writing, and pitch every definition, analogy, and level of detail at them.

Both skills say "audience", and here it means one thing only: how much the reader already knows,
which is a question about register. It is never a reason to put more on the page. Step 3 settled what
the page may carry, and writing that content more plainly never widens it — an explanation pitched
lower is the same material in shorter words.

## 6. Verify the output invariants

Run `ctxr publish check <path>`. It runs the mechanical half of the checklist:

- nothing loaded from an external address (a link the reader follows is fine), a viewport meta tag,
  at least one print rule, and a provenance line;
- a sibling README, balanced tags, and valid syntax in every embedded script;
- the page's filing location from step 4;
- for a disposable page, its shape (`disposable-shape`): one folder directly under `disposable/`,
  with a real date at the start of its name;
- for a permanent page, the note it represents (`represented-note`) and that note's recorded hash
  (`represented-note-hash`).
- for each send copy at the page folder's root, a file name that starts with a real date
  (`send-copy-name`).

The command reports the page's lifespan. It exits non-zero and names every failing check. Fix all of
them before you report the page as ready. The command answers only what the files can show. Why: the
lifespan choice and the DO-test in step 1, the form and reader choices in step 5, and factual accuracy
are judgment calls, not checker output.

`ctxr publish new` and `ctxr publish check` each end by naming the address `ctxr serve` answers for
this page. Look at the page before you hand it on. Whether the form works, whether the prose reads,
whether it renders at all is exactly what the checks above cannot answer, and it is cheapest to fix
while the page is still yours.

That address may be served from another host, or behind an access proxy, where you cannot reach it.
You do not need it: from this machine, start `ctxr serve` in the background, open the address it
prints followed by the page's route in your browser tool, and stop the server when you are done. A
page still in a session worktree is served there under its previewable route, the same as anywhere
else. If you have no way to see a rendered page, say in your hand-off that it has not been checked
visually, so whoever reviews it knows they are the first to look. Never report a page as ready on the
strength of `ctxr publish check` alone.

A page written in a session worktree is previewable rather than published, because the
published-pages address reads the store's own checkout and the page has not reached it yet. That
previewable address stops answering the moment the worktree is reclaimed — the last step of
`ctxr-land` — and the page is then at the published-pages address the command named beside it.
Report the address you actually opened, and say which of the two it is, so nobody is handed a link
that is about to change.

Both addresses are full URLs when the store declares `serve.base_url` in `contexture.yaml`, and bare
routes such as `/preview/…` when it does not. A bare route is not a link anyone else can open. Do not
guess a host to put in front of it: hand on the route as it is, and tell the operator that declaring
`serve.base_url` would make every address a command reports a link.

## 7. It's a page, not a note

The published-pages location is excluded from retrieval by default — a page never becomes a source for
anything else the store retrieves. Confirm with `ctxr lint` after landing.

## 8. Provenance and drift

The source notes are the fact of record. When a fact changes, change the note first, then the page.
Search the page for every place that repeats the fact, such as a summary line, a total, or a status
badge. Update each one before you say the update is done. Why: a page that repeats a number in three
places goes stale in all three if you change only one.

`ctxr publish check` and `ctxr lint` report a permanent page as stale when its represented note
changed after the stamp. To confirm a stale page, do these steps in order:

1. Review the page against the note, and update the page where the two disagree.
2. Remove the `<!-- hash:… -->` marker from the README's lead-link line.
3. Run `ctxr publish stamp <path>` again.

`ctxr publish stamp` never overwrites a marker. Why: a stamp without a review confirms nothing, so
the stale report stays until somebody removes the marker.

**Send copies of the page.** A send copy is a file that you make from the note and send to somebody.
It is a `.pdf`, `.docx`, `.xlsx` or `.pptx` file. Make a send copy only when you send one. Why: every
send copy is kept, so a send copy for each edit fills the folder.

Write the send copy into the page's folder, next to `index.html`. Start its file name with the date
you make it: `<YYYY-MM-DD>-<name>.<extension>`. `ctxr publish check` fails a send copy at the folder
root that has no real date (`send-copy-name`). `ctxr publish check --json` lists each send copy with
its address. Give that address when you hand on the send copy.

A send copy is never a page on its own. A document that you send as a PDF, a Word file, a workbook or
a deck still needs an `index.html` for the same content. Why: every command that reads pages finds a
page by its `index.html`. The stamp on its README then reports the page and its send copies as stale
together.

When the page changes, write a new dated send copy. Do not change or remove an earlier one. Why: an
earlier file can be the one a recipient got, and the folder then shows what you sent on each date.

The commit gate checks both rules in every store. It refuses a commit that adds a send copy with no
date in its name. It also refuses a commit that changes a send copy that is already committed. Why: the
skill alone cannot stop an overwrite, and the gate runs on every commit. To send again, write a new
dated file. You can move or delete a send copy together with its page.

Put a file that the page uses, but that you did not make, in the page's `assets/` folder. Why:
`ctxr publish check` reads only the files at the folder root as the page's send copies.

The store chooses how to make a send copy. You can print `index.html` to a PDF, because it already
has a print rule. You can also use the store's own document or spreadsheet skill. Contexture does not
make send copies.

**A file that is its own source.** Some office files are not made from a note. An example is a
financial model that somebody edits by hand in a spreadsheet. Do not publish that file. Keep it in
the store, next to the note that describes it, with no date in its name. Why: the file is the source,
and the note describes it. A published copy would sit where retrieval does not look, and the stale
report would treat the note as the source. Git keeps the file's history. When you send a copy of the
file to somebody, that copy is a send copy: write it, dated, into the page's folder.

A file that you received from somebody is a capture. File it where the store keeps its captures.

Never revise a disposable page after it lands. Why: it is a snapshot of one moment, and its link
shows that moment. Make a new disposable page instead. Do not remove a disposable page yourself.
`ctxr lint` lists disposable pages that are older than 30 days, and the operator decides which to
remove (`ctxr-organize-audit`).

## 9. Landing

A page's files are ordinary tracked content — they land via `ctxr-submit` like any other change. If a
change also touches a derived artifact in the sense `ctxr-derived-artifacts` covers (catalog, graph,
generated document sections), follow that skill's check-before-build discipline for those separately;
a published page is authored content, not something `ctxr-derived-artifacts` rebuilds.
