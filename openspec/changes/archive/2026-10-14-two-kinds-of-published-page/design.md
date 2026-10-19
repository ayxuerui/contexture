## Context

See proposal.md — Why. What already exists and shapes the approach:

- **The dated-slug reservation.** `publish` already refuses a page whose final segment begins
  `YYYY-` or `YYYY-MM-DD-` "for a living (non-snapshot) page", and the skill says that naming "is
  reserved for a frozen snapshot". The reservation was written for a page kind nothing ever created.
  A disposable page is that kind; this change gives it a way in rather than a second naming rule.
- **The lead link.** `src/core/publish/filing.ts` (`readmeLeadsWithStem`) already reads the first
  wikilink in a page README's body, frontmatter excluded, via `extractLinkTargets(parseNoteText(...))`,
  and `derive-the-page-filing-path` D4 measured it on a 28-page store: 26 pages link a note, and on
  all 26 the lead link was the page's subject. The convention is real; it is just unchecked.
- **The catalog's frozen hash.** `renderCatalogEntry` stamps `<!-- hash:<16 hex> -->` the first time
  a gloss is non-empty and never rewrites it; `checkCatalogStale` compares it to
  `contentHashOfBody(note.body)`; `ctxr-derived-artifacts` tells the agent to confirm a stale gloss by
  reviewing it, stripping the marker, and rebuilding. That is the drift model this change copies.
- **Who runs `ctxr publish check`.** Only an author working on a page. `ctxr-submit` does not run it,
  `ctxr doctor` does not run it, and no hook does. A check added to it fails on touch, never
  store-wide — which decides the rollout (D8).
- **Retrieval exclusion is by path.** The whole configured publish path is excluded from retrieval,
  so anything filed under it — including a new subtree — is excluded with no new rule.
- **The slug rule.** `slugifySegment` turns every run of characters that is not a letter, digit or
  mark into `-` and trims `-`. A store folder named "Disposable" slugifies to `disposable`, which is
  why D2 reserves that segment.

**Sequencing.** This change lands last, after `review-the-knowledge-diff`,
`render-diagrams-in-notes` and `explain-in-controlled-english`. Of the four it is the least
reversible — a check every existing kept page newly fails, and a URL segment every disposable page
carries for as long as its link is held — and D4 rests on an assumption no one has verified
page by page. Task phase 1 is a read-only audit that settles D4 before any code is written.

## Goals / Non-Goals

**Goals:**

- A place for throwaway pages that is linkable, reviewed, excluded from retrieval, and visibly
  separate from the pages a store keeps.
- Turn "a page is the rendered form of one note" from a sentence in a skill into a check, and make a
  page's drift from that note something a command reports.
- Every page that exists today keeps its URL and needs no file moved.

**Non-Goals (design-level, beyond the proposal's):**

- No change to the browsing surface, and no change to `ctxr publish gather` or the existing publish
  requirements beyond the reserved `disposable` segment (D2), which modifies the filing-path
  derivation requirement by one sentence and two scenarios. Everything else is ADDED.
- No new frontmatter key. The hash marker is an HTML comment on a body line, exactly as the catalog's
  is, so the "a frontmatter key a specification depends on is named in exactly one place" rule is not
  engaged.

## Decisions

### D1 — Disposable pages are committed, under their own subtree of the publish path

A disposable page is ordinary tracked content: written in a session worktree, previewable there,
landed by `ctxr-submit` through a reviewed pull request, served at the published-pages address once
it lands, and removed later by another reviewed change.

**The rejected option, at full strength: never commit them.** Write disposable pages to a scratch
path outside git (or a gitignored subtree). The case for it is real:

- *Zero review cost.* A page built to understand something once is read once, often within the
  hour. Routing it through a pull request spends a reviewer's attention on something nobody will
  look at next week.
- *Git never forgets.* Removing a committed page does not shrink the repository; every disposable
  page ever landed stays in every clone's history forever. Pages are HTML with their data inlined
  (the external-reference check forbids anything else), so a large comparison table or a week of
  agent activity can be hundreds of kilobytes. A store that takes the "intelligence is abundant, ask
  for large discardable artifacts" advice seriously could produce more page bytes than note bytes.
- *The lifecycle is honest.* Something meant to be thrown away is thrown away by not keeping it, not
  by a reminder 30 days later that somebody has to act on.

Why it loses, in order of weight:

1. *No link.* Nothing serves an untracked path. The preview route serves a session worktree's pages
   only while that worktree exists, and it is reclaimed by `ctxr-land`. "What did my agents do this
   week" is very often built to be *sent* — to the operator on a phone, to a collaborator — and the
   published-pages address through the served checkout is the only address that outlives the
   session. A page you cannot link to has lost half its reason to be a page rather than a terminal
   transcript.
2. *No review is not zero cost, it is unreviewed.* A disposable page is still store content copied
   out for a reader. The publish skill's step 3 — whether a note's content belongs in front of this
   page's readers — applies with full force, and review is the one point at which a second reader
   sees it. Uncommitted pages would be the one kind of store output that never passes it.
3. *The operator asked for it.* They said disposable pages "could still be submitted but kept in a
   different folder". The separate folder answers the clutter half of the problem; it does not need
   the git half to be given up.

The repository-growth argument is the one that survives. Mitigation: removal reported by lint (D6)
keeps the *working tree* and the navigation small, and the review cost is bounded because the
`ctxr-submit` Pages table names the lifespan, so a reviewer can skim a disposable page.

**What would flip it:** disposable pages measurably dominating repository growth (say, over half of
the pack size added in a quarter on a real store), or evidence that landed disposable pages are not
opened after landing (the served checkout's access log shows the published address of disposable
pages going unrequested). Either says the link and the review are not worth what git charges. The
flip would be a gitignored `disposable/` plus a serve route for it, not a redesign: location-based
lifespan (D3) survives it unchanged.

Also considered and rejected: **a separate branch or repository for disposable pages.** It keeps
history out of the main line but needs its own serving and its own review path, which is the cost of
committing without the benefit of the existing machinery.

### D2 — The location is a fixed segment, `disposable/`, directly beneath the publish path

A disposable page lives at `<publish.path>/disposable/<YYYY-MM-DD>-<name>/` — exactly one level
under the segment, no grouping by subject.

*Why a fixed segment rather than a config key.* New config keys in this project are opt-in: optional,
with no shipped default. A disposable location that existed only once configured would make the
feature off in every store, and the skill could not tell an agent where to file the page without
first teaching it to check for a key. A segment under `publish.path` inherits that path's shipped
default, its retrieval exclusion, its serving, and its preview route for free.

*The strongest case for a key:* a store may want its disposable pages somewhere other than under
its kept pages — outside the publish path entirely, so they could be gitignored, or named in the
store's own language. Answer: the first is D1's flip, and would be made then; the second is a label
the browsing surface could carry later without moving a file. **Would flip it:** a store that needs
disposable pages served from a different root (a different access proxy, say) than kept pages.

*Why `disposable`, and how it is kept from colliding — the operator's choice.* The operator chose
the plain word: a reader of `/publish/disposable/2026-10-13-agent-week/` learns at the point they
read the URL that the page is not meant to be kept. `scratch` undersells that the page is linked and
reviewed; `snapshots` matches the existing reservation's wording but tells a URL's reader nothing
about whether to keep holding it.

The plain word can collide: a store with a top-level notes folder named "Disposable" slugifies to
`disposable`, so `ctxr publish gather` could derive a filing path whose first segment is the
reserved one, and a permanent page filed there would read as disposable. The name is therefore
*reserved*, enforced at each point a page can enter it:

- `ctxr publish gather` reports that no filing path derives when the derived path's first segment
  would be `disposable`, naming the reservation as the reason. This is the existing "no path derives"
  outcome with a second reason, so gather still reports the resolved set and still exits with the
  success code — it gates nothing, as its contract requires; the author files the page by the same
  judgment the store-root case already asks for.
- `ctxr publish new <slug>` without `--disposable` refuses a slug whose first segment is `disposable`,
  naming the reservation and `--disposable`.
- `ctxr publish check` treats any page under `disposable/` as disposable by location, so a permanent
  page filed there by hand fails `disposable-shape` (no tool-stamped date, or nested) — the check
  reports the misfiling without having to know the author's intent.

**The rejected alternative: `_disposable`.** Its strength is structural rather than procedural: the
slug rule turns every non-letter, non-digit run into `-` and trims it, so no derived segment can ever
begin with `_`, and the collision above cannot happen at all — no reservation, no refusal, no extra
reason on gather. It lost on readability where the name is actually read: the leading underscore
reads as "internal plumbing" in a URL handed to somebody, and in the published-pages navigation,
which labels a folder by its directory segment. **Would flip it:** a real store with a top-level
folder named `disposable` (or one slugifying to it) whose pages the reservation keeps refusing — the
reservation would then be costing more than the underscore's ugliness. Task 1.1's audit of the two
client stores looks for exactly that folder.

*Why flat under the segment.* The page's date is its sorting key and its age (D6); a subject folder
would add a decision to a page whose whole point is being cheap, and the subject a disposable page is
"about" is often not a store folder at all ("this week"). One level also makes the shape checkable.

### D3 — Lifespan is read from location alone; no README field

`lifespanOf(path)` is `disposable` when the page folder's first segment under the publish path is
`disposable`, and `permanent` otherwise. Nothing is written into the page to declare it.

**The rejected option: a README field** (`lifespan: disposable` in the README's frontmatter or
body). For it: it is explicit, a reader of the README sees it, it survives a page being moved, and
promoting a disposable page to permanent would not change its URL — the one thing a location-based
lifespan cannot offer.

Against it, decisively: two sources of truth that can disagree (a "disposable" README filed among
kept pages — which wins?), a migration that touches every existing README, and a precedent pointing
the other way — `publish check` already *refuses* a `kind` field in a page README, because "a page's
kind is the folder name alone". Location is also what every consumer actually reads: the age check
reads the dated name, lint walks the subtree, the URL already says it. And existing pages become
permanent by doing nothing.

On promotion: a disposable page whose insight deserves keeping is not promoted in place. The insight
goes into a note first — the note is the fact of record — and a permanent page is built for that
note. The disposable page then ages out on its own schedule. **Would flip it:** operators routinely
wanting to keep a disposable page's URL alive past its window, which would say the link, not the
content, is what they value.

### D4 — A permanent page represents exactly one note: its README's lead link

`ctxr publish check` gains `represented-note` for a permanent page: the first wikilink in the
README's body must resolve, by filename stem — the same resolution `--entity` and the graph use — to
exactly one note in the store's note enumeration. No link, a link resolving to no note, and a link
resolving to two or more notes are each a named failure. A page may draw from any number of notes;
everything after the lead link is a citation.

*Reading the lead link is one function.* `filing.ts`'s `readme-link` signal and this check read the
same thing, so the reading is factored out of `filing.ts` into `represents.ts` and both call it. A
page `gather` counts as a subject's and a page `check` says represents that subject cannot disagree.

**The rejected option, at full strength: don't enforce 1:1.** Some pages genuinely are about a set:
`publish gather --under` and `--entity` exist precisely to build pages from many notes, a status
board over a project folder represents the folder, and forcing a note in front of it is ceremony.
And `file-published-pages-by-location` D1 rejected exactly this kind of check — resolving a README's
wikilinks inside `publish check` — because "it makes the mechanical checker depend on link resolution
and on the README's prose being complete, and it would fail a correct cross-cutting page".

Why it loses:

- *How many scenarios assume a multi-note page.* Five subtree scenarios across three existing
  requirements (subtree resolution, filing-path derivation, the subject segment) concern the *source
  set* and *where a page is filed*; none states that a page represents no note, and none is
  contradicted by a page that draws from many notes while leading with one. `--entity` already takes
  a note path — an entity page represents the entity note by construction.
- *Every set has a note.* A subtree page represents the subtree's hub note — the note the store's
  own skills already expect a folder to have (organize-audit records a folder's retirement in it;
  placement links new notes from it). A subtree with no hub note has two honest answers: write the
  hub (the store wanted one anyway) or admit the page is disposable. A page that represents no note
  and is meant to be kept is a page whose facts live nowhere but the page — the exact failure step 8
  of the skill warns about.
- *The predecessor's objection is answered by what changed.* D1 there refused to judge *where a page
  is filed* from README prose, because a correct page could fail. Here the README lead link is not
  evidence about something else — it is the invariant. A permanent page without one is not a
  correct page that the check misjudges; it is the defect being named. The dependence on link
  resolution is accepted, and is the same resolution `gather` already performs.

**Would flip it:** a real store whose kept pages are mostly set-shaped with no plausible hub note
(the 28-page measurement found the opposite), or authors leading READMEs with a hub note purely to
pass the check, so the lead link stops meaning anything. The fallback then is a third lifespan, not
dropping the check.

**Status: confirmed by the audit (2026-10-13).** 43 of 48 kept pages across both client stores map
to one note or a hub note. The 5 others are dated one-offs that become disposable. See "Audit of
existing pages" below. The original provisional reasoning follows.

*Before the audit:* The 28-page measurement above shows lead links *agree with
the subject `gather` was given*; it does not show that each page *is* the rendered form of one note
rather than a set or a one-off. Task 1.1 classifies every existing page in both downstream client
stores as one-note, hub-note or neither, and the result is recorded under "Audit of existing pages"
below. D4 stands if `neither` pages are few and read as one-offs (they migrate to disposable, or gain
a hub note). If they are a meaningful share of kept pages, D4 is revised — a third lifespan for
set-shaped kept pages, or a represented-note check that accepts a folder — and the spec delta and
tasks are updated before implementation begins.

### D5 — The represented note's hash is a frozen marker on the lead-link line, written by `publish stamp`

`ctxr publish stamp <path>` resolves the lead link and, when the line holding it carries no
`<!-- hash:… -->` marker, appends one with `contentHashOfBody` of the represented note — the
primitive the catalog and `source-hash` use. When a marker is present it writes nothing and reports
whether it is current or stale. `ctxr publish check` fails `represented-note-hash` when the marker is
absent ("not stamped") or differs from the note's current hash ("stale"). Confirmation is the
catalog's discipline verbatim: review the page against the note, remove the marker, stamp again.
Stamp never overwrites a marker, so stamping without removing confirms nothing and the finding stays.

*Why a marker on the README line rather than a frontmatter key or a sidecar.* It is the catalog's
format, so an agent that has learned one has learned both; it sits next to the link it describes, so
changing the lead link to another note visibly orphans the old hash (and the next check reports it
stale against the new note, forcing a re-stamp); and it engages no frontmatter-key rule.

*Why a separate command rather than stamping inside `publish new` (`--represents <note>`).* The
`derive-the-page-filing-path` D4 deferral called a scaffold-time subject marker "the better long-term
answer". Stamp has to exist regardless — for every existing page, and for confirmation — so adding
it to `new` too is a second writer of the same marker. **Would flip it:** authors repeatedly reaching
`publish check` with a filled lead link and no stamp, which says the second step is friction worth
folding into the first.

*Why `check` fails on a missing stamp rather than only on a stale one.* The catalog skips unstamped
entries ("nothing to go stale"), because a gloss can legitimately be empty. A permanent page cannot
legitimately have no recorded state of its note: an unstamped page is one whose drift is
undetectable, which is the thing this change exists to close.

*Disposable pages are never stamped.* `stamp` refuses one; they are frozen by definition, and a
disposable page's README may lead with no note at all.

### D6 — Lint reports, nobody deletes; the window is a fixed 30 days

`ctxr lint` gains two observations:

- `disposable-page-due` — every disposable page whose name's date is more than 30 days before today,
  with its age.
- `page-representation` — every permanent page that names no resolvable note, is not stamped, or is
  stale against its note.

Both exit 0 like every lint finding, and `ctxr doctor` reports neither. The organize-audit skill hands
the first to the operator as a list for a yes or no, and the second to the publish skill's drift step.

**The rejected options for where age is reported:**

- *`ctxr doctor`.* Doctor fails on invariants; an old disposable page violates nothing. A store
  whose operator is happy to keep a page for 90 days would fail doctor — and therefore fail
  `ctxr-submit`'s gate — for keeping it. Strongest form: doctor is what actually gets run, every
  submit. Answer: lint is what organize-audit runs, which is the skill whose job retiring things is.
- *`ctxr publish check`.* It checks one page an author names; age is a store-wide question. A per-page
  check that failed on age would fail an author editing nothing but a typo.

**Why 30 days, and why no key.** A key would have to be opt-in with no shipped default, so the
report would be off until configured — and a store that never configures it accumulates pages, the
problem this change exists for. 30 days is long enough that "this week" and "this month" pages are
still around for their natural rereads, short enough that the list stays one screen. The constant
lives in `src/core/publish/lifespan.ts`, not in config. **Would flip it:** an operator asking for a
different window. The answer then is an optional key that, when absent, behaves as 30 — the shape
`serve.previews` already uses.

Age is read from the page's dated name, not from git: it is derivable from the file, identical across
clones, and is the date the tool stamped.

### D7 — "Never updated after landing" is a convention, made visible, not a check

No command can distinguish a landed disposable page from one still being written: `publish check`
reads a file, not history. The rule therefore lives in the skill, and the visibility lives in the
report — `ctxr publish urls` names a change to a disposable page as `modified` with lifespan
`disposable`, and the Pages table puts that pair in front of the reviewer. Claiming more in a
requirement would rest on an agent following an instruction.

### D8 — Existing pages: permanent by location, fail on touch, listed by lint

Every existing page is permanent and keeps its URL. On upgrade, each newly fails `represented-note`
and/or `represented-note-hash` — but only when an author runs `ctxr publish check` on it, which they
do while editing it, which is when a one-line lead link and one `ctxr publish stamp` cost least. Lint
lists the whole backlog store-wide as observations, so an operator who wants to clear it at once can.

**The rejected option: warning-first** — report the two new checks as warnings for a release, then
promote them to failures. For it: no author is surprised mid-edit, and stores can migrate on their
own schedule. Against it: `publish check` has no warning channel today, so this adds a severity
concept to a command for one release and a second change to remove it; and the surprise it protects
against is an author, mid-edit, being told the page they are editing does not name its note — which
is exactly when it should be fixed. The store-wide schedule is already non-blocking via lint.
**Would flip it:** a store gate starting to run `ctxr publish check` over every page (a hook, or
submit), at which point fail-on-touch becomes fail-everything and warning-first is the right rollout.

No `ctxr update` migration rung: nothing in `contexture.yaml` changes, and the ladder migrates config,
not page files.

## Audit of existing pages

Run 2026-10-13, read-only, against the local clones at `/home/ubuntu/workspace/pkm` and
`/home/ubuntu/workspace/readyrun-brain`, both on `main`. Pages are every `index.html` under
`.contexture/publish/` (the shipped default; neither store sets `publish.path`). Session worktrees
(`.worktrees/`, `.claude/worktrees/`) and pkm's legacy `artifacts/pages/` (outside the publish path)
were not counted. "Lead link names it" means the README body's first wikilink names the represented
note *and* that stem resolves to exactly one note file, which is what `represented-note` will check.

| Store | Pages | One-note | Hub-note | Neither | Lead link already names it |
|---|---|---|---|---|---|
| pkm | 35 | 20 | 10 | 5 | 26 of the 30 one-note/hub-note pages |
| readyrun-brain | 13 | 1 | 12 | 0 | 13 of 13 |
| **Both** | **48** | **21** | **22** | **5 (10%)** | **39 of 43** |

**`neither` pages (all pkm; every one is a dated, frozen one-off):**

- `areas/brightstar-ai/2026-07-09-bcp-hackathon-judge-pack`: a judging scorecard for one event. Its
  README links no note. It would have been disposable.
- `projects/job-hunting-2026/google-director-of-engineering-quality-and-ai-research/2026-07-21-courtney-walkin`:
  a walk-in sheet for one interview. It leads with the role note but does not render it. It would
  have been disposable.
- `…/2026-07-22-archana-walkin`: the same kind of page, for another interview. Disposable.
- `…/2026-07-24-diego-walkin`: the same kind of page, for another interview. Disposable.
- `…/2026-07-24-venu-walkin`: the same kind of page, for another interview. Disposable.

**Lead links that do not yet name the represented note (4):**

- `archives/projects/banff-vancouver-2026/2026-06-28-trip-board` (one-note): the link uses the note's
  title, `Banff & Vancouver Family Trip — June 2026`, so the stem matches nothing. The file is
  `Banff-Vancouver-2026.md`.
- `resources/ai/foundational-models/evidence-board` (hub-note): the page covers the folder but leads
  with one member note. The folder has no hub note, so it plainly needs one.
- `resources/ai/agents/agent-quality-study` (hub-note): leads with `AI Agent Evaluation`. The cluster
  hub `AI Agent.md` exists.
- `resources/skills/system-design/system-design-playbook` (hub-note): leads with the delivery
  framework. The README itself names `[[System Design]]` as the cluster hub.

**Reading of the classes.** Hub-note pages are the project dashboards and explorations. Each leads
with the project's `… Overview` or hub note: all nine readyrun-brain `exploration` pages, the A-Fund,
exit, campaign, Kinaera and Kungfu boards, and the readyrun-brain `--under` landscape pages. One of
these, `resources/startups/fysk-september-16-showcase`, compares the companies from one evening. It
leads with the folder hub `Startup Landscape`, but it also reads as a one-off that could be
disposable. Ten pkm pages already carry a dated final segment as "snapshots" (the five above plus
the trip board, the Nestor sheet, Kinaera entity formation, and two dated `resources/ai/agents`
pages). They show that authors already reach for a frozen kind of page, and they have no place to
file one.

**`disposable` collision (D2's flip): none.** Neither store has a `disposable` entry under its
publish path. Neither store has a top-level notes folder that slugifies to `disposable`. pkm's
top-level folders are `archives areas artifacts projects raw resources`, and readyrun-brain's are
`archives areas projects raw resources`. No tracked path in either store contains the word.

**Decision on D4 (task 1.3): confirmed.** Of 48 kept pages, 43 (90%) map to one note or a hub note.
The 5 `neither` pages are a small share, and every one is a dated one-off. They migrate to
`disposable/` (or are removed) and do not need a third lifespan. Set-shaped pages are common (22),
but each one has a hub note to lead with. Only one folder, pkm's
`resources/AI/Foundational Models/`, lacks a hub. That matches D4's "write the hub" answer. The
migration backlog that lint will show is 43 unstamped pages. 4 of them also need their lead link
corrected first. The spec delta and tasks are unchanged.

## Risks / Trade-offs

- **Repository growth from committed disposable pages** → Bounded in the working tree by lint's
  removal list; not bounded in history. D1 names the measurement that would reverse the call.
- **An existing directory named `disposable` under a store's publish path** → Its pages would read
  as disposable and fail the shape check. A store folder named "Disposable" could have produced it via
  `gather`'s derived path before this change. The task 1.1 audit checks both downstream client
  stores for it, and task 7.3 re-checks before shipping; D2 names this as the flip to `_disposable`.
- **Authors leading with a hub note just to pass the check** → The check guarantees a resolvable,
  stamped note, not a meaningful one. The skill's decision step says what a representation is; a
  page that cannot name its note honestly is disposable.
- **The represented note is archived** → If the archive destination is outside the note enumeration,
  the lead link stops resolving and the page fails on touch and appears in lint. That is the right
  signal — a page representing retired work is itself a retirement candidate — but it arrives as a
  "no note" failure rather than a "note retired" one.
- **Two notes share the lead link's stem** → A named `represented-note` failure listing both, fixed
  by an aliased or path-qualified link — the same ambiguity doctor fails between notes, which never
  sees a page README because the publish path is outside the note enumeration.
- **Promotion changes a URL** → Accepted (D3); the promoted content goes through a note.

## Migration Plan

0. Run the task-phase-1 audit and settle D4 on it; only then implement.
1. Ship. No config, schema or page file changes; every page is permanent and serves where it did.
2. `ctxr lint` in each store lists permanent pages under `page-representation`. The operator (or
   organize-audit) works the list: lead each README with its note, `ctxr publish stamp`, land.
3. Rollback: revert the release. Stamped markers are HTML comments and inert to an older CLI;
   `disposable/` pages are ordinary pages to it and keep serving.

## Open Questions

- Whether the browsing surface should later label the `disposable` group and order it newest first.
  Deferrable: it changes no file, URL or check.
