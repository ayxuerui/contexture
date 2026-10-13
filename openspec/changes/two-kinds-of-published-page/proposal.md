## Why

A store's published pages are two different things that the tooling treats as one. Some are built
to understand something once — an explainer, "what did my agents do this week", a side-by-side for
one decision — and are worth nothing a month later. Others are the rendered form of a note that
keeps changing, and are worth exactly as much as they agree with it. Today both are filed, checked
and kept the same way, so the first kind accumulates forever beside the pages that matter, and the
second kind drifts from its note with nothing to notice.

The cost of a throwaway page has collapsed: asking an agent for a large, custom, discardable
artifact is now the cheap way to understand something. That makes the first kind common, and a
store with no place for it either refuses the request ("does this earn a page over a note?") or
buries its durable pages under a growing pile of one-offs.

The second kind already has half a rule. The publish skill tells the author to "lead a page's source
notes with the note it is a representation of", and `ctxr publish gather` already reads that lead
link to decide whose page a page is. But nothing checks the lead link exists, and nothing notices
when the note it names changes after the page was built — the drift the skill's step 8 asks an agent
to remember by hand.

## Sequencing and the audit that gates it

This change is sequenced last: after `review-the-knowledge-diff`, `render-diagrams-in-notes` and
`explain-in-controlled-english`. It is the least reversible of the four — it adds a check that every
existing kept page newly fails, and a URL segment every disposable page will carry — and it rests on
an unverified assumption: that most kept pages map to one note. Its first task phase is therefore a
read-only audit of every existing page in both downstream client stores, classifying each as
one-note, hub-note or neither. The result is recorded in design.md, and design.md D4 is confirmed or
revised on it before any implementation starts.

## What Changes

- **Two lifespans, read from location.** A page filed under a fixed segment, `disposable/`,
  directly beneath the store's configured publish path is *disposable*; every other page is
  *permanent*. No README field declares it. Every page that exists today is permanent, unchanged.
- **Disposable pages are committed, dated by the tool, and never revised.**
  `ctxr publish new --disposable <name>` scaffolds `<publish path>/disposable/<YYYY-MM-DD>-<name>/`
  with today's date — the frozen snapshot the existing dated-slug reservation was set aside for.
  The segment is reserved: a slug spelled into `disposable/` without the option is refused, and
  `ctxr publish gather` reports that no filing path derives — naming the reservation, still exiting
  with the success code — for a subject whose store folder would slugify to `disposable`. `ctxr publish check` verifies a
  disposable page's shape (one level under the segment, a real calendar date leading its name).
- **Old disposable pages are reported, never removed.** `ctxr lint` lists every disposable page whose
  date is more than 30 days past as a removal candidate. The `ctxr-organize-audit` skill hands that
  list to the operator; removal is a reviewed change like any other.
- **A permanent page represents exactly one note, checked.** `ctxr publish check` fails a permanent
  page whose README does not lead with a wikilink resolving to exactly one note. A page may still
  draw from many notes; it represents one.
- **Drift is detected the way catalog glosses detect it.** New `ctxr publish stamp <path>` records the
  represented note's content hash as a `<!-- hash:… -->` marker on the README's lead-link line, once,
  and never overwrites it. `ctxr publish check` fails a permanent page whose marker is absent or no
  longer matches; `ctxr lint` lists the same store-wide. Confirming a stale page is the catalog's
  discipline: review the page against the note, remove the marker, stamp again.
- **Every page report names its lifespan.** `ctxr publish new`, `ctxr publish check` and
  `ctxr publish urls` carry it; the `ctxr-submit` Pages table gains a column for it.
- **The publish skill decides the lifespan first.** `templates/skills/ctxr-publish.md` gains a step,
  ahead of everything else: permanent if the page represents one note that will keep changing,
  disposable otherwise. Step 1's "does this earn a page over a note?" applies to permanent pages
  only.

Not breaking for commands: every existing option and output field is unchanged. A permanent page
that predates this change newly fails two `ctxr publish check` checks until its README leads with
its note and is stamped; nothing in a store runs that check except an author working on the page,
and `ctxr lint` lists every such page so an operator can see the backlog. Design.md Migration Plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `publish`: the filing-path derivation requirement is modified to report no derived path, naming
  the reservation, when the path would land in the reserved `disposable` segment. It also gains requirements for a page's lifespan read from its location, scaffolding and
  checking a disposable page, a permanent page naming the one note it represents, and recording and
  checking that note's content hash. Every other existing requirement is untouched — the dated-slug
  reservation already names the frozen snapshot a disposable page is.
- `context-organize`: lint gains observations for disposable pages past their window and for
  permanent pages out of step with their note.
- `harness-portability`: the publish skill decides a page's lifespan before scaffolding, the
  organize-audit skill hands removal candidates to the operator, and submit's Pages table names each
  page's lifespan.

## Non-goals

- **Deleting anything automatically.** A disposable page's URL may still be in somebody's hands, and
  removal costs that link. Lint names candidates; the operator decides, and removal lands through a
  reviewed pull request whose Pages table marks the address as ceasing to work.
- **A config key for the disposable segment or the 30-day window.** New keys here must be opt-in
  with no shipped default, and a lifespan that only exists once configured is a feature that is off
  in every store. Both are fixed; design.md D2 and D6 name what would make either a key.
- **A lifespan field in the page's README.** Location already answers it, a field could disagree
  with the location, and `publish check` already refuses a `kind` field in a page README. Design.md
  D3.
- **Enforcing that a landed disposable page is never edited.** No command can tell a landed page from
  an unlanded one at check time; `ctxr publish urls` reports such an edit as `modified` with lifespan
  `disposable`, which puts it in front of the reviewer instead. A requirement that claimed more
  would rest on an agent following an instruction.
- **Keeping disposable pages out of git.** Argued and rejected in design.md D1, with the evidence that
  would reverse it.
- **Any other change to `ctxr publish gather`.** Beyond honouring the reserved segment, its
  derivation, existing-page scan and exit contract are unchanged; it already identifies a page's
  subject by the same lead link this change checks.
- **Special navigation for disposable pages** in `ctxr serve` (newest first, a distinct label). They
  appear as one folder group in the published-pages area, which is enough until somebody asks.
- **A `publish new --represents <note>` that writes the lead link and stamp at scaffold.** Deferred:
  `publish stamp` must exist anyway for every existing page and for confirmation. Design.md D5.

## Impact

- `src/core/publish/lifespan.ts` (new): the segment constant, `lifespanOf(relativePath, publishPath)`,
  the disposable-name date parse, and the 30-day window constant.
- `src/core/publish/represents.ts` (new): reading a README's lead link (the same reading
  `filing.ts`'s `readme-link` signal uses, factored out so the two cannot diverge), resolving it to a
  note, and reading and writing the hash marker.
- `src/commands/publish-new.ts`, `publish-check.ts`, `publish-urls.ts`: lifespan field and the new
  checks; `src/commands/publish-stamp.ts` (new); `src/run.ts`: `--disposable` and `publish stamp`.
- `src/core/checks/` (lint manifest): two observation checks.
- `templates/skills/ctxr-publish.md`, `ctxr-organize-audit.md`, `ctxr-submit.md`; `README.md`'s
  publish section.
- No config schema change, no `schema_version` bump, no migration rung.
