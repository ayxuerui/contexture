## Why

`file-published-pages-by-location` gave a published page a place to be: not flat at the publish
root, but inside a grouping directory named for where its subject lives. It stopped one level short
of the store. The skill's step 4 says `<top-level-folder>/<subject>`, "two levels, no more" — so a
subject whose notes live three or four folders deep publishes under the first of those folders and
throws the rest away. Every page drawn from anywhere under one top-level folder lands as a flat
sibling of every other, and the pages area re-acquires, one level down, exactly the flatness that
change set out to fix.

The notes area beside it has no such cap. `context-browsing` requires both folder trees to group
"to the full depth those paths carry", and they render through one primitive into one sidebar. So a
reader sees the same store twice: once organized as the store organizes it, and once flattened to
two levels, inches apart.

The second half is that *which* folder is a judgment the agent re-makes for every page, with
nothing to check it against. Nothing in the tool knows where a subject lives, so nothing can tell
an author their page went somewhere else. Drift is invisible until someone reads the tree: a page
whose every source note lives under one top-level folder, filed under a different one, serves and
checks clean today.

Both halves have the same answer. `ctxr publish gather` already resolves a subject to its note set;
it is already holding the one fact the filing path needs — where the subject lives — and reports
everything about the subject except that.

## What Changes

- `ctxr publish gather` reports the path under the configured publish path at which a page for its
  subject belongs, derived from the subject selector: the subject's store folder path at the full
  depth it runs to, each segment slugified. A subtree selector derives the prefix it names; a note
  or entity selector derives the directory holding the note it names.
- That path carries one further segment, naming the subject note, exactly when the subject already
  has a page — so a subject's first page sits directly in its folder path and its later pages
  collect beside the first under one segment. When carrying that segment would leave an existing
  page in the wrong place, the command reports the page, where it would move to, and which signal
  counted it as the subject's. It moves nothing.
- The reported path appears in both the human-readable and the `--json` output, the JSON carrying
  both the form `ctxr publish new` accepts and the store-relative form.
- `templates/skills/ctxr-publish.md` step 4 stops stating a two-level convention and states instead:
  file the page at the path `gather` reports, append the page's own name, and when gather reports a
  move, make it and name the changed URL to the operator. The `README.md` paragraph follows.

Not breaking: `gather` gains a field and gates nothing, every existing field is untouched, and no
page moves, is renamed, or stops serving. `publish new` already accepts a slug of any depth, so the
derived path needs nothing from it.

## Capabilities

### New Capabilities

None. Both requirements land on the existing `publish` capability.

### Modified Capabilities

- `publish`: gains two requirements — one deriving a page's filing path from its subject's store
  folder path at full depth, one inserting a segment naming the subject once that subject has more
  than one page and reporting the move that implies. The subject-resolution and page-check
  requirements are untouched.

## Non-goals

- **Tightening `ctxr publish check` to audit a page's filing location.** Predecessor D1 settled
  that the check answers only what is derivable from the file being checked, and rejected exactly
  this: resolving the page README's source-note wikilinks and comparing them against its parent. A
  gate that depended on an author's prose being complete would fail a correct page. `gather`
  resolves wikilinks because it *advises*, at authoring time, with the store in hand; the check
  *gates*, and stays the floor it is — "not flat", and nothing more.
- **Deriving or enforcing the path in `ctxr publish new`.** A second call site can disagree with
  gather about the subject, and a `new` that computed a required move could only perform it
  (breaking a handed-out URL with nobody looking) or refuse to scaffold — the trade predecessor D3
  rejected. `new` stays a scaffolder: validate the slug, write two files.
- **Moving existing pages.** A page's URL is the one thing about it that cannot be corrected later.
  The command reports the move and the evidence for it; making it is the caller's act, taken
  deliberately, with the operator told.
- **Deriving the path from where the resolved notes live** (their deepest common ancestor) rather
  than from the selector. It is unstable — a new backlink in another folder would relocate a
  subject's home — and it collapses to the store root precisely for the cross-cutting subjects it
  would exist to serve, which is no path at all. Argued in design.md D2.
- **A machine-written subject marker on a page.** Recording the subject in a page's README at
  scaffold time would make the "does this subject have a page" question exact instead of inferred.
  It is the better long-term answer and is deliberately deferred: no existing page carries one, so
  the README scan has to exist regardless, and adding it now would drag `publish new` into note
  resolution. Argued in design.md D4.
- **A `schema_version` bump, a config key, or a migration.** The derivation reads
  `publish.path`, which already exists with a shipped default. Nothing about a store changes.
