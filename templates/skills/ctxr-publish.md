Turn store content into a shareable HTML page for a subject — a store subtree, a single note, a
concept whose sources aren't co-located, or everything a named context admits. The gate below is the
one step no convention can enforce by itself; everything else here is a decision procedure, not a
mechanism.

## 1. Does this earn a page over a note?

Reach for a page when the reader needs to compare options side by side, see spatial structure, manipulate
something, navigate non-linearly, or share a link — and the store's own notes genuinely can't. A page
costs several times the effort of the markdown it's drawn from; don't build one to restate a note in a
different font. If a note would do the job, the note is the deliverable.

## 2. Name the subject, let the selector produce the set

`ctxr publish gather` resolves a subject to its source notes — never a hand-picked list, which is how a
walled note slips in unnoticed:

- `--under <prefix>` — a store subtree
- `--note <path>` — a single note
- `--entity <name>` — every note linking to a concept, the same enumeration `ctxr rollup gather` uses
- `--as <context>` — everything a named context can see

## 3. Gate before copying anything out

`ctxr publish gather --audience <audience>` evaluates every resolved note through the same tri-state
disclosure verdict `ctxr check` uses, and reports the worst verdict in the set. Run it FIRST, before
reading a single note for content:

- **DENY** notes contribute nothing — not a title, not a count, not a paraphrase.
- **ASK** stops the build; name the note to the operator and wait.
- Only **ALLOW** content may be quoted or summarized into the page.

Never infer a verdict from a note's resolved visibility on your own — an external audience's verdict
requires an explicit tag or a human answer, not an inference from how widely a note is already visible.

## 4. Fix the identity once

`ctxr publish new <slug>` creates the page's folder. A slug starting with a date (`YYYY-` or
`YYYY-MM-DD-`) is reserved for a frozen snapshot — never used for a page you intend to keep updating.
The command refuses to overwrite an existing folder; if one already exists for this subject, edit its
files directly rather than re-running `publish new` — a rename or an overwrite breaks any link already
handed out.

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

Both skills say "audience", and neither means step 3's. There, `--audience` names who the store is
being asked to disclose to and the answer is a verdict; here it names how much a reader already knows
and the answer is a register. A comprehension level is never a value you pass to `--audience`, and
writing plainly never widens what the page may contain — the gate in step 3 already settled that.

## 6. Verify the output invariants

`ctxr publish check <path>` runs the mechanical half of the checklist — no external network address,
a viewport meta tag, at least one print rule, a provenance line, a sibling README, balanced tags, and
valid syntax in every embedded script. It exits non-zero naming every failing check; fix all of them
before reporting the page as ready. It answers only what's derivable from the file itself — the DO-test
in step 1, the form and reader choices in step 5, and factual accuracy stay judgment calls, not checker output.

## 7. It's a page, not a note

The published-pages location is excluded from retrieval by default — a page never becomes a source for
anything else the store retrieves, and it never carries the visibility field (that would falsely signal
it's indexed). Confirm with `ctxr lint` after landing.

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
