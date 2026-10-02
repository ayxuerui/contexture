## Context

See proposal.md — Why. Everything this change needs already exists and is load-bearing:

- `publish gather` already resolves all three selectors to a store-relative path and already
  receives the `Store`, so `publish.path` and the subject's location are both in hand before any
  note is read. `--entity` resolves its argument to a store path and throws `NoteNotFoundError`
  when the file is absent (`resolveEntityNotes`) — it takes a path today, so it and `--note` differ
  only in what they enumerate, never in what names the subject.
- `extractLinkTargets` (`src/core/graph/model.ts`) is the one answer this codebase gives to "what
  does a wikilink refer to", already used by `resolveEntityNotes` and by the graph's stem index.
- `PUBLISH_INDEX_FILE` (`src/core/browse/routes.ts`) is already the definition of "what a published
  page is". Nothing else may re-spell `'index.html'`, or the serving side and the derivation can
  disagree about what they are both looking at.
- `buildPathTree` and `publishPages` already carry a page at any depth, and `checkPageLocation`
  already passes anything deeper than the publish root. The serving side needs no change at all:
  the cap this change removes was never in code.

The constraint that shapes the spec: a requirement may not rest on an agent following an
instruction. "File the page where gather said" is an instruction, so it stays skill prose. "Gather
reports where the page belongs" is a command's output, so it can be a requirement — and that split
is the same one predecessor D1 drew, moved one step earlier in the workflow.

## Goals / Non-Goals

**Goals:**

- Make the filing path a derivation with one definition, in one module, reachable from one command.
- Remove the depth cap by making depth fall out of the store rather than out of a rule.
- Leave every existing page serving at its existing URL, and leave `publish check` and the whole
  browsing surface untouched.

**Non-Goals (design-level, beyond the proposal's):**

- No config key and no schema change. The derivation is a pure function of the selector, the store
  tree, and `publish.path`.
- No cache. The scan reads at most two directories' worth of READMEs, on a command an author runs
  once per page.

## Decisions

### D1 — The derivation is a module, not a command

`src/core/publish/filing.ts` holds the slug rule, the subject-to-path derivation, and the
existing-page scan. `publish-gather.ts` stays what it is: resolve, derive, report.

Rationale: `src/core/publish/script-check.ts` is the existing precedent for a publish concern that
is not a command, and the derivation has to be unit-testable against a table of names without a
`Store` or a `RunEnv`. It also keeps the slug rule in one place the moment a second caller wants it.

### D2 — The group folder comes from the selector, never from the resolved set

| selector | subject folder | subject note |
|---|---|---|
| `--under <prefix>` | `slugifyPath(prefix)` | none |
| `--note <path>` | `slugifyPath(dirname(path))` | the note |
| `--entity <path>` | `slugifyPath(dirname(path))` | the note |

Rejected alternative: **the deepest common ancestor of the resolved notes.** Three reasons, in
order of weight:

- It collapses to the store root for exactly the subjects it would exist to serve. A real store's
  pages draw sources across its whole taxonomy — a walk-in sheet cites the role, the person, and
  three reference notes — so the common ancestor is the root, which names no folder, which means no
  derived path at all and a page filed flat that `publish check` then fails. Two commands
  contradicting each other over the ordinary case.
- It is unstable. One new backlink in another top-level folder silently relocates a subject's home,
  so `gather` would start prescribing moves because somebody edited an unrelated note.
- The selector's own directory is where the store *already says* this subject lives. Asking the
  backlinks re-derives, worse, an answer the path already gives.

The set's spread is not discarded — the resolved note list is in the same output, so an operator
who wants to see that a page sits away from most of its sources still can.

### D3 — The subject segment appears exactly when the subject already has a page

A segment naming the subject note sits between the folder path and the page, when either the
subject note already has at least one page, or the folder path is empty.

Rationale: the first clause is what keeps a one-page subject shallow while still collecting a
multi-page subject. The alternative — always inserting it — puts every page one level deeper than
it needs to be and names most directories after their only child. The second clause exists so a
subject note at the store root still yields a path one level deep, which satisfies
`checkPageLocation`'s floor by construction rather than by luck.

Accepted cost, argued and confirmed before this change was written: promoting a subject moves the
page that was already there, and a moved page's URL breaks. The derivation is therefore built to
*report* the move with its evidence and to move nothing — see D5. The conditional framing in the
report is deliberate: gather also runs against a subject that has one page and is not acquiring
another, where the honest sentence is "belongs there once a second page exists", not "must move".

Corollary, stated in the skill prose rather than here: since the folder now carries the subject, a
page is named for what it *is*, never for its subject. A derived `<subject>/<subject>` is the
shape this produces when a page was named for its subject, and the fix is the page's name.

### D4 — Two signals count a page as a subject's, both scoped to two directories

A page counts as the subject note's when it sits **directly** in the subject's slugified folder
path, or **directly** in that path's subject segment, and either:

- `readme-link` — the FIRST note its sibling `README.md` links (parsed by `parseNoteText`, so
  frontmatter is excluded) is the subject note; or
- `page-name` — its own directory segment equals the subject note's slugified stem.

Scope first: those two directories are the only two this derivation ever files into, so they are
the only two where "would a new page land beside one of this subject's" can be answered. Scanning
`<group>/` recursively would count a *deeper store folder's* pages as this subject's, which is
precisely the mistake the full-depth mirror exists to stop making.

`readme-link` reuses the stem rule rather than inventing a second one, and binds to the *lead* link
rather than to any link. Measured against a real store, "links it at all" claimed three unrelated
pages for one note — each a proposed move of a URL somebody holds — because a page's README cites
its neighbours after naming its own subject. Leading with the subject is how these READMEs are
actually written: on a 28-page store it agreed with the subject on all 26 pages that link anything.
`page-name` costs nothing and covers the one failure the first signal has: a page whose author named
it for the subject and left the README's source-note section unfilled.

The failure modes, stated rather than papered over:

- *False negative* — a README that leads with something other than its subject. The page is not
  counted, and the subject quietly ends up with two pages in the folder path. Nothing gates this
  either way, and the spec says so. This is the cheap direction to fail in, which is why the lead
  link rather than any link is the signal.
- *False positive* — a page about another subject in the same folder whose README happens to cite
  this one. Undecidable from a README. The mitigation is structural, not heuristic: gather moves
  nothing, and reports which signal matched, so the caller reads the evidence before touching a
  URL. A false positive costs a reading; it cannot cost a broken link.
- *Stem ambiguity* — two notes sharing a basename. Already an accepted degradation across this
  repo's graph; scoping to one directory shrinks it to near-nothing.

Rejected for now: **a subject marker written into the page's README by `publish new`**, which would
make this exact. Deferred because no existing page carries one (so the scan must exist anyway), it
would drag `publish new` into note resolution and into performing-or-refusing a move at scaffold
time — predecessor D3's rejected trade — and it would introduce a frontmatter key a specification
depends on, which the project's rules say is named in exactly one place.

### D5 — Gather reports; nothing here moves or gates anything

`filing` is data on a command whose contract is that it gates nothing. Moves are reported as
`notices` (stderr in both output modes) rather than as `findings`, and the exit code is the success
code whether or not a move is reported.

Rationale: the existing spec scenario pins that gather's JSON carries "no per-note verdict". A
finding reads as a verdict, on a command that has none to give. `notices` is where this repo puts
"something the caller should read before acting", and it keeps the detail off the one-line human
summary and out of `--json` stdout.

### D6 — The slug rule: lowercase, fold runs of non-alphanumerics, keep every script

```
lowercase → NFC → replace each run of [^\p{L}\p{N}\p{M}] with '-' → trim '-'
```

- **Any script's letters and digits are kept.** ASCII-folding was rejected: it is a Latin-centric
  half-measure that slugifies a CJK or Cyrillic store's entire taxonomy to empty strings. Combining
  marks are kept so a lowercasing that decomposes a character does not leave a stray separator.
  NFC runs after lowercasing so a decomposed filename and a composed one derive the same slug.
- **`&` is not expanded to `and`.** Expanding it embeds English in a derivation shipped to stores
  written in any language. It is punctuation, and becomes a separator like every other mark.
- **No truncation.** Slugification never lengthens its input, so a segment is already bounded by
  the filesystem. Truncation is the one transform that can silently merge two distinct subjects
  onto one path; an over-long path failing at `publish new` with a real `ENAMETOOLONG` is honest.
- **A segment that slugifies to nothing is dropped**, not replaced with a placeholder. The derived
  path is a new address, never a lookup key, so nothing depends on segment count.
- **Idempotent** — `slugify(slugify(x)) === slugify(x)`. Load-bearing: every comparison against an
  on-disk directory name runs both sides through the same function, which makes the scan
  insensitive to filesystem normalization and to whatever case an author typed.

Rejected alternative: **mirror the store path verbatim**, preserving case and spaces. It reads
better in the sidebar and is exactly reversible, but it puts `%20` in every URL a page is shared
by — and the shared artifact is the whole point of publishing. The top-level segment would have to
be lowercased anyway to keep matching `taxonomy.layers[].path` for its group label.

### D7 — `publish new`, `publish check`, and the browsing surface are untouched

`publish new` already accepts a multi-segment slug, already creates intermediate directories, and
already binds the reserved dated-prefix rule to the final segment alone — and the derived path is
always parent directories, so a derived `2026-review` segment is already blessed by that
requirement's existing scenario. The only work is a test feeding gather's reported prefix straight
into `publish new`, so the two cannot drift apart silently.

`buildPathTree` handles a directory and a leaf sharing a name — one of the three edge cases its
header comment says the single primitive exists to handle once — so a page that holds both its own
index and child pages renders as a `<details>` group followed by a page entry, and both routes
resolve. Under D3 the derived subject folder is always a pure grouping directory, so the mixed node
only arises from a hand-written slug, which this change does not alter.

## Risks / Trade-offs

- **A subject's second page moves its first** → Reported, never performed, with the matching signal
  named (D4/D5). The skill directs the author to make the move deliberately and tell the operator
  the URL changed.
- **The existing-page scan can be wrong in both directions** → Both directions named in D4, both
  visible in the output, neither able to change a file.
- **Pages already filed under the two-level convention now disagree with what gather reports** →
  They keep serving at their URLs and keep passing `publish check`; nothing in this change fails
  for them. Re-filing a store's existing pages is an operator's decision, page by page, because
  each one costs a URL.
- **A store with a deep taxonomy gets deep published paths** → That is the point, and the tree
  renders them; `nav.ts` opens only the top level on arrival, so a deep store's sidebar is still
  bounded by its top-level directory count.
