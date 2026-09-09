## Context

See proposal.md — *Why*. The constraints that shape the approach, all already in the specs:

- **The code/judgment seam.** The CLI computes, writes and verifies; editorial decisions live in skill
  markdown. Anything here that decides *what a store is about* is on the wrong side of it — which is why
  the entity templates ship as a **declared** library rather than as an assertion.
- **Two ownership patterns already exist** for shipped store-resident files. Owned skills carry an in-file
  managed header; vendored skills cannot, so they carry a sidecar with a content hash and a
  preserve-and-report contract. Note templates need the second, for a different reason (D2).
- **`skills.vendored` is the precedent for a declared set** — a list defaulting to the shipped set, with an
  empty list meaning "install none."
- **`retrieval.relations` defaults to empty**, deliberately: no typed edges until a store declares names.
- **An omitted configuration key resolves to its shipped default**, which is how a new default reaches a
  store that never named it — and, with migrations retired and an older recorded version now refused
  outright, the only way one can.

## Goals / Non-Goals

**Goals:**

- One implementation shape reused, not a third one invented: render like `convention-doc.ts`, declare and
  sync like a vendored skill.
- The installed templates stay correct when a store's configuration changes, with nobody re-syncing by hand.
- A store's own note kinds are first-class neighbours at the same path, not second-class files elsewhere.
- Every section in a shipped template is one the evidence supports, or is marked as unevidenced.

**Non-Goals** (beyond proposal.md — *Non-goals*):

- No new fenced-region mechanism. `entry append` and `rollup write` already create their region on demand.
- No change to what `ctxr doctor` fails on. Everything this adds that can report is a lint finding.

## Decisions

### D1 — Templates live in the tool-owned home directory, under their own config block

`templates.path` (shipped default `.contexture/templates/`) and `templates.installed`.

A `templates:` block rather than keys on `harness:`, because that is the shape `catalog:` and `publish:`
already use for the same kind of thing — an authored-but-tool-owned location with its own settings.
`harness_portability` still owns the *requirement*; config-block naming and spec ownership are independent
here exactly as they are for the catalog.

*Alternative considered:* a root-level `templates/`, which is where the origin store keeps its own and
which a file-tree-browsing editor surfaces more readily. Rejected on `context-store`'s existing rule that a
fresh init leaves the root uncontaminated — the catalog, skill pack and published pages all moved into the
home directory for this reason, and a template is the same kind of thing.

The default path inherits the `.contexture/` retrieval exclusion, but that inheritance is **not** relied
on: `templates.path` is added to the note-enumeration exclusion explicitly, so the exclusion follows the
configured location even for a store that overrides `retrieval.exclude_paths`.

### D2 — Ownership is a record at the path, never a marker in the template's bytes

A template's bytes are copied into a note. The managed header every owned skill carries would be copied
with them and appear at the top of every note the store writes. A frontmatter key would be worse: it would
ride into notes *and* add a key to a schema `context-store` deliberately keeps optional.

So `.ctxr-templates.json` at the templates path, naming each delivered template and the sha256 of the bytes
contexture last wrote. Named in the record ⇒ contexture manages it. Absent ⇒ store-authored, never touched.
This is the vendored-skill contract verbatim, including preserve-and-report on a modified file.

*Alternative considered:* path-based ownership via a `_shipped/` subdirectory. Rejected — it makes "copy the
base to cut your own kind" a two-directory operation and separates a store's kinds from the shipped ones.

### D3 — `{{title}}` / `{{date}}`, substituted by the agent

Markdown has no templating standard, so the question is which convention a reader recognizes. `{{name}}` is
the Mustache/Handlebars lineage shared by essentially every markdown-adjacent template system, and the
origin store's files already use it, so defining it costs no churn.

*Alternative considered:* contexture's internal `__TOKEN__` dialect. Rejected on a property specific to this
file type: `__X__` renders as **bold** in any markdown viewer, so a placeholder that survived into a note
looks deliberate. `{{title}}` renders literally and is unmistakably wrong — the failure is loud, which is
what a leftover placeholder needs to be.

*Alternative considered:* a `ctxr note new` command. Rejected — `ingest` requires `--into` so the CLI never
decides a note should exist; a note-creating command to buy one string substitution moves an editorial
decision across the seam for no mechanical gain.

The lint check matches the **enumerated vocabulary only**, never any double-braced text: notes legitimately
quote other tools' syntax, and a check that reports those is one operators learn to ignore.

### D4 — A template is fixed content, not a rendered artifact

An earlier draft rendered a template's relation sections from `retrieval.relations`, so a store that
changed its vocabulary got templates that followed. It was dropped, and the reasoning is worth recording
because the mechanism was genuinely appealing.

It bought synchronisation between two things only one of which needed to exist. The vocabulary was already
a configuration surface nobody had asked for, and the rendering existed to keep templates in step with it —
machinery justified by other machinery. Making the compass fixed content removes both: the four sections
are simply part of what a `Concept` note looks like, written into the file with a definition under each.

The cost is that a store using a different vocabulary has a template with headings it does not type. That
cost is close to zero — an unused heading is an ordinary section, and a store editing its own copy is one
line — and it is paid in a file the operator can see and change, rather than in a renderer they cannot.

This also means every packaged template is byte-identical across stores, which the spec now states. The
sync still takes `config`, because it is scoped by the configured path and the declared list; only the
file's *content* stopped varying.

### D5 — A declared library, not a shipped opinion

The library includes entity kinds — a person, an organization, a deal-shaped record. Shipping those as
unconditional defaults would have contexture assert that every store is about people and companies, which
is editorial and on the wrong side of the seam.

`templates.installed` resolves it the way `skills.vendored` already resolves the identical problem for
third-party skills: contexture packages the set, the store declares which it installs, the default is the
full set, and an empty list opts out entirely. A store that is about a codebase deletes two lines.

### D6 — No layer binding

A configuration key mapping a taxonomy layer to a default template was considered and rejected on three
grounds, the first decisive:

- **The layer is the wrong granularity.** In the origin store, `areas/` holds `areas/People/`,
  `areas/Companies/` **and** that layer's own hub notes. One default per layer is wrong for at least two of
  those three. A layer is a placement axis; it is not a kind.
- **It would read as enforcement while being none.** Nothing compels an agent to use a bound template, and
  this repo has an explicit rule that a requirement whose only enforcement is "the agent is told to" is a
  skill convention, not a requirement. A config key that implies a guarantee it cannot keep is worse than an
  honest instruction.
- **The mechanism already exists at the right level.** The baseline conventions already direct an agent to
  read a directory's own `README.md` before working in it, and the origin store already has one at
  `areas/Companies/`. One line there does the job, with no new key, no schema change, and no shipped
  per-layer opinion — and it works for a directory nested three levels inside a layer, which a layer
  binding never could.

So `ctxr-placement` states the rule generally; a directory's README states its exception.

### D7 — One idea template, not two, and no `## Source` section

The origin store's `Permanent Note.md` and `Literature Note.md` are byte-identical apart from the tag value
— one shape wearing two labels. They ship as a single `Concept.md`, named for the section that carries the
content (`## Concept`, 72 notes) rather than for one method's vocabulary. This is also the template that
carries the rendered relation sections, so the compass has a vehicle.

Its `## Source` heading is **dropped**: `ctxr ingest` already records provenance in the note's `sources:`
frontmatter, machine-written and hash-frozen. A hand-maintained `## Source` body section is a second channel
for the same fact, and it is the one that rots. Worth flagging as reversible — 87 notes carry the heading —
but that number measures the old template's reach, not the section's usefulness, since every one of those
notes was cut from a template that contained it.

### D8 — Heading spelling: keep a strong incumbent, sentence-case anything new

A shipped heading that renames something 20+ notes already use creates drift for no gain. So: keep the
incumbent spelling where usage is strong (`## Follow-ups` 32, `## Concept` 72, `## Related` 27, `## Bio` 27,
`## Communication Log` 26, `## Relationship` 26), and use sentence case for everything else
(`## Open threads`, `## Key personnel`, `## Business context`, `## Goal`). `tags` is always a block
sequence — the current `tags: Project, StatusNew` is one string, not two tags.

Action items use one heading across the whole library, `## Follow-ups`, and seed the format as a **comment**
rather than a live `- [ ]`, which the current entity templates leave as a false open task in every note.

## The packaged library

Drafts, for review as part of this design — not files on disk until apply. Every template carries the
base's three frontmatter keys and its `# {{title}}` heading, and every one is fixed content (D4).

**`Note.md`** — the base, and the file a store copies to cut its own kinds.

```
---
date_created: "{{date}}"
title: "{{title}}"
tags: []
---
# {{title}}
```

**`Concept.md`** — a synthesized idea. Replaces the permanent/literature pair (D7); carries the compass as
fixed content, each heading followed by the definition of what belongs under it.

```
## Concept
<!-- The idea in your own words. -->

## Upstream
<!-- The thinking this note is built on … if removing a linked note would leave this one unfounded. -->

## Downstream
<!-- What follows from this note. The inverse of Upstream — one direction does not record the other. -->

## Similar
<!-- Resembles this one in structure, pattern, or topic, where neither depends on the other. -->

## Opposing
<!-- Contradicts this one, or holds where it fails. Record the tension; do not drop a side. -->
```

**`Project.md`** — work with a stated end state.

```
## Goal
<!-- What done looks like. Work with no end state is an area, not a project. -->

## Open threads
<!-- Unresolved decisions and blockers; each links where it was raised. -->

## Follow-ups
<!-- - [ ] Task text (added YYYY-MM-DD, due YYYY-MM-DD) -->

## Related
<!-- Links out to related notes. -->
```

Evidence: `## Goals` and `## Tasks` appear in **0** of the store's 35 project notes; 23 of 35 carry a
links-out section under one of its two spellings. The `StatusNew` tag is dropped — 23 notes say `StatusNew`
and exactly 1 says `StatusCompleted`, so it is written once by the template and never updated; contexture's
answer to lifecycle is `ctxr archive`, a tracked move.

**`People.md`** — a person. Tagged `People`.

```
## Bio
<!-- Who they are: current role, organization, relevant history. -->

## Relationship
<!-- How you know them, and in what context. -->

## Communication Log
<!-- Dated entries, one per exchange: ### YYYY-MM-DD — context -->

## Follow-ups
<!-- - [ ] Task text (added YYYY-MM-DD, due YYYY-MM-DD) -->
```

Evidence, over 31 person notes: Bio 27, Follow-ups 27, Communication Log 26, Relationship 26. Dropped
because they appear in **0** of them: `## Professional Background`, `## Core Beliefs / Working Style`,
`## Network`. Also dropped: `type: person` (1 note) and `aliases: []` (2).

**`Company.md`** — an organization. Tagged `Company`.

```
## Overview
<!-- What they do, sector, stage. -->

## Key personnel
<!-- [[Name]] — role. -->

## Business context
<!-- Model, competitive position, differentiators. -->

## Key metrics
<!-- Whatever this store tracks: revenue, headcount, growth. -->

## Interactions
<!-- Dated entries: ### YYYY-MM-DD — context -->

## Follow-ups
<!-- - [ ] Task text (added YYYY-MM-DD, due YYYY-MM-DD) -->
```

Adoption is thin — 2 of the 18 notes in that folder follow it, and only 5 carry frontmatter at all — so this
is normalized rather than redesigned; there is no evidence to redesign *from*. One section is dropped:
`## AI / Transformation Angle`, which is a specific analytical lens rather than a fact about an organization,
and is the clearest piece of subject-matter opinion in the set. A store that wants it adds it to its own copy.

**`Deal.md`** — a transaction record. Tagged `Deal`.

```
## Terms
<!-- Round size, valuation, instrument, lead, board seat. -->

## Counterparty
<!-- [[Company]] — what they do, team, key metrics. -->

## Thesis
<!-- Why this is compelling. -->

## Key relationships
<!-- [[wikilinks]] to investors, advisors, co-investors. -->

## Interactions
<!-- Dated entries: ### YYYY-MM-DD — stage or event -->

## Follow-ups
<!-- - [ ] Task text (added YYYY-MM-DD, due YYYY-MM-DD) -->
```

The store has **zero** deal notes, so nothing here is evidenced; it is the existing template normalized, with
`## Use of Funds` folded into `## Thesis`. Kept because it is a shape the operator intends to use.

### D9 — A new `core/note-templates.ts`, not an addition to `skills.ts`

Renders like `core/convention-doc.ts` and syncs like the vendored-skill half of `core/skills.ts`. Kept
separate because `skills.ts` is already the largest module in `core/` and carries the *other* ownership
mark; a reader who confuses the two marks writes the bug D2 exists to avoid. The existing
`packagedTemplate` / `substituteBlock` loader is reused as-is.

### D10 — No schema-version bump

Both keys are additive with shipped defaults, so an existing `contexture.yaml` parses unchanged and every
component reads the shipped values. Propagation happens through the configuration itself, which is what
`context-store`'s omitted-key requirement specifies.

Bumping would not merely be unnecessary — it would be breaking. Since the store-migration machinery was
retired, `store-lifecycle` refuses a store recorded at an OLDER schema version than the running release,
"because the running release no longer reads that shape and offers nothing that would bring it forward."
A bump here would lock every existing store out of the CLI, with nothing left to unlock it, in exchange
for a key that resolves to its default perfectly well without one.

## Risks / Trade-offs

- **Shipping entity kinds is editorial, which the seam reserves for skills.** → Resolved by making the set
  *declared* (D5) rather than asserted: contexture offers, the store chooses, an empty list opts out. The
  spec still forbids the packaged library from being enumerated anywhere but its one requirement, so growing
  it is a visible spec change rather than a quiet commit adding a file.
- **A store whose vocabulary differs from the compass gets headings it does not type.** → An unused heading
  is an ordinary untyped section, not an error, and the fix is editing one's own copy — which the record
  then reports as locally modified rather than silently overwriting.
- **A rendered template makes an operator edit and a config-driven re-render hard to tell apart.** → The
  record holds the hash of what contexture last wrote *for this store's configuration*. Anything else is an
  operator edit: preserved, reported, never overwritten.
- **Two of the six templates are barely or not at all evidenced** (Company 2/18, Deal 0/0). → Marked as such
  above, normalized rather than redesigned, and individually removable from `templates.installed`. Neither
  is load-bearing for any mechanism.
- **The placeholder lint could fire on legitimate content.** → Scoped to the two enumerated names; the origin
  store contains notes carrying another tool's double-brace syntax, and that case is a spec scenario.
- **A store already holding templates elsewhere now has two locations.** → contexture writes only to the
  configured path and touches only files its record names. A store can point `templates.path` at its existing
  directory, relocate on its own schedule, or never.

## Migration Plan

None, and none possible — the store-migration machinery has been retired. Both keys are additive with
shipped defaults, so nothing needs to run. On the release after
this lands, a store's next `ctxr update` creates the templates path and writes the declared set; a second
`update` writes nothing. Rollback is uninstalling the newer CLI — the directory it wrote is inert, excluded
from retrieval, and no command depends on it.

The stores on this machine relocate their own template files, and reconcile with the packaged set, as their
own changes, gated on the npm release rather than on this merge.

## Open Questions

- **Whether `Concept.md` should keep a `## Source` section** (D7). Dropped here on the reasoning that
  `ctxr ingest` owns provenance, but 87 notes carry the heading and the operator may want the prose channel
  regardless. Reversible without touching the specs, the approach, or the task breakdown — it is one line in
  one packaged file.
