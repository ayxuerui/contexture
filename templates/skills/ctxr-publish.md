Turn store content into a shareable HTML page for a subject — a store subtree, a single note, or a
concept whose sources aren't co-located. Deciding what belongs on the page is the one step no
convention can enforce for you; everything else here is a decision procedure, not a mechanism.

## 1. Does this earn a page over a note?

Reach for a page when the reader needs to compare options side by side, see spatial structure, manipulate
something, navigate non-linearly, or share a link — and the store's own notes genuinely can't. A page
costs several times the effort of the markdown it's drawn from; don't build one to restate a note in a
different font. If a note would do the job, the note is the deliverable.

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

## 4. Fix the identity once, at the path `gather` reported

Step 2 reported the path under the store's published-pages location at which a page for this subject
belongs, derived from where the subject's notes live. Take it verbatim, append the page's own name,
and hand the result to `ctxr publish new <slug>`, which creates the folder and its sibling README:

```sh
ctxr publish new <reported path>/<page-name>
```

The depth is the store's own, not a fixed number of levels — a subject whose notes live four folders
deep files four folders deep. That is what makes the published-pages navigation read like the store
instead of like one long list. `ctxr publish check` reports a page filed flat at the published-pages
root as a failing check, and checks nothing further about the location, because which folder is
right is the question `gather` already answered.

Name the page for what it *is*, never for its subject. The folders above it already carry the
subject, so `<reported path>/<subject>` says one word twice while `<reported path>/decision-board`
says something.

When `gather` reports that an existing page belongs at the reported path too, it is because this
subject is acquiring a second page, and a subject's pages collect under one folder naming it. Move
that page there before you scaffold the new one, and tell the operator its URL changed — somebody
may already be holding that link. `gather` moves nothing itself, and it names which signal counted
the page as this subject's; read that before you move anything, because the signal is a reading of
the page's README and can be wrong. Lead a page's source notes with the note it is a representation
of — that lead link is what says whose page this is, and everything after it is a citation.

When `gather` reports that no path derives — the subject names the store root itself, so no folder
names it — the choice is yours to make and to own: pick the folder that best names the subject to
the reader, write that choice and your reason into the page's README, and name it to the operator.
Nothing checks this for you, by design. Filing a page under a word that names nothing serves nobody
who reads it.

A slug starting with a date (`YYYY-` or `YYYY-MM-DD-`) is reserved for a frozen snapshot — never used
for a page you intend to keep updating. That rule binds the page's own final segment, not the folders
it is filed under. The command refuses to overwrite an existing folder; if one already exists for
this subject, edit its files directly rather than re-running `publish new` — a rename or an overwrite
breaks any link already handed out.

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

`ctxr publish check <path>` runs the mechanical half of the checklist — no external network address,
a viewport meta tag, at least one print rule, a provenance line, a sibling README, balanced tags,
valid syntax in every embedded script, and the page's filing location from step 4. It exits non-zero naming every failing check; fix all of them
before reporting the page as ready. It answers only what's derivable from the file itself — the DO-test
in step 1, the form and reader choices in step 5, and factual accuracy stay judgment calls, not checker output.

`ctxr publish new` and `ctxr publish check` each end by naming the address `ctxr serve` answers for
this page. Open it and look at the page before you hand it on. Whether the form works, whether the
prose reads, whether it renders at all is exactly what the checks above cannot answer, and it is
cheapest to fix while the page is still yours.

A page written in a session worktree is previewable rather than published, because the
published-pages address reads the store's own checkout and the page has not reached it yet. That
previewable address stops answering the moment the worktree is reclaimed — the last step of
`ctxr-land` — and the page is then at the published-pages address the command named beside it.
Report the address you actually opened, and say which of the two it is, so nobody is handed a link
that is about to change.

## 7. It's a page, not a note

The published-pages location is excluded from retrieval by default — a page never becomes a source for
anything else the store retrieves. Confirm with `ctxr lint` after landing.

## 8. Provenance and drift

The source notes are the fact of record. When a fact changes, change the note first, then the page —
and grep the page for every place that fact was echoed (a summary line, a total, a status badge) before
declaring the update done; a page that repeats a number in three places goes stale in all three if only
one is touched.

## 9. Landing

A page's files are ordinary tracked content — they land via `ctxr-submit` like any other change. If a
change also touches a derived artifact in the sense `ctxr-derived-artifacts` covers (catalog, graph,
generated document sections), follow that skill's check-before-build discipline for those separately;
a published page is authored content, not something `ctxr-derived-artifacts` rebuilds.
