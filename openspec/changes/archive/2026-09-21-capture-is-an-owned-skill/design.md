## Context

See proposal.md — Why. What shapes the approach here is three constraints already in the codebase.

**The code/judgment seam.** The CLI computes, writes, verifies, and owns git; agents read, synthesize, and decide. Capture is almost entirely judgment — what counts as the record, which of several returned items is the one asked for, whether this is already in the store — and the mechanical parts it does need (dedupe, identity, retention) are already CLI surface. That puts the bulk of this change in skill markdown, with one config key and one precondition behind it.

**Owned skills already drive tools contexture does not provide.** `ctxr-submit` ends in `git push` and `gh pr create`; `ctxr-land` reads and merges through `gh`. contexture ships no forge adapter and deliberately removed the one it had, once those skills replaced the commands that needed it. The affordance check over rendered skills is scoped to match: an option named for a tool other than contexture is outside what it resolves. A capture skill over a connected source needs no new seam — it is the shape that already exists.

**The config is deliberately loose.** Unknown top-level keys survive the load and are failed by `doctor`; unknown keys nested inside a block are stripped at parse time, and `doctor` catches only the nested keys contexture has itself retired. That is why the inert `ingest.required_capture_sections` declaration in a live store went unreported, and it is also why this key can be added without a schema-version bump.

## Goals / Non-Goals

**Goals:**

- One procedure that holds for any harness and any connected source, with no vendor or source-type literal in the shipped text.
- A mechanical backstop for the one capture rule that matters most and is least robust to being routed through an agent: the capture carries the record, not a paraphrase of it.
- No new seam. No adapter kind, no command, no credential surface, no schema-version bump.

**Non-Goals:**

- Beyond proposal.md's Non-goals: this design does not attempt to make capture reproducible or byte-stable. Two agents capturing the same meeting may produce different files; dedupe by source id is what makes that safe, not determinism at capture time.

## Decisions

### D1 — Transport stays outside `ctxr`; the skill drives whatever the harness connected

Alternatives considered:

- **Vendor clients in `ctxr`.** Rejected on release-path coupling: the published harness image's tag is the `ctxr` version it carries, asserted at build time, and the `schema_version` gate is both-directional with no migration mechanism. A vendor's field rename would become a `ctxr` patch release, a new image, and a re-pin in every store. It would also put the first credential handling into a tool whose premise is that a store is an ordinary git repository any harness can operate.
- **A capture-source adapter kind.** The adapter registry is deliberately kind-generic and already reserves room for a second kind, so this would fit the existing shape. Rejected because it buys the seam without removing the churn: the adapter's implementation still has to live somewhere and still has to track the vendor. `bootstrap-contexture-core` D5 declined to design a search-adapter seam ahead of a concrete adapter for the same reason, and the forge kind was removed once its consumers moved to skills over `gh` — the two precedents point the same way.
- **A store-local skill with scripts (the status quo).** Works, and is what a real store does today. Rejected as the destination because it does not survive a second store: the client gets copied and the two diverge, with no mechanism to notice.
- **Shipping the client as a vendored skill.** Vendored skills already carry exactly the anti-drift machinery this would want — a provenance record, refresh on `update`, and local-modification detection that preserves rather than clobbers. Rejected for now only because vendoring sources from the package means the client ships inside the tarball, which is D1's rejected option wearing a different hat. If unattended capture is ever needed again, extending vendoring to accept an external source is the move; that is recorded in proposal.md's Non-goals so it is not re-argued from scratch.

### D2 — The skill is named `ctxr-capture`, and `ctxr-session-capture` keeps its name

The owned set uses two naming forms, and which one a skill takes is load-bearing. A skill named for a
command group *is the procedure for that group* and drives its verbs: `ctxr-publish` runs
`publish gather|new|check`, `ctxr-rollup` runs `rollup gather|stale|write`, `ctxr-session-capture` runs
`ctxr session capture`. Every other skill is named for the judgment it makes and drives whatever commands
serve it — `ctxr-mission` runs `rollup` verbs, `ctxr-placement` runs `archive`, `lint` and `doctor`, and
`ctxr-submit`/`ctxr-land` deliberately correspond to no command at all.

This skill belongs to the second form. It runs exactly one command, `ctxr source check`, and has the
thinnest mechanism behind it of anything in the set — capture is almost entirely judgment. So its name must
not be command-shaped. `ctxr-source-capture` was considered for its symmetry with `ctxr-session-capture`
and rejected on exactly this: it reads as `ctxr source capture`, a verb the `source` group does not have and
that proposal.md's Non-goals rules out ever adding. It would be the only skill in the set whose name asserts
a command that does not exist.

A bare noun that is not a command is well precedented — `ctxr-placement`, `ctxr-mission`, `ctxr-upgrade`,
and the two the README explains at length. The word `capture` stays because the knowledge loop names five
moves and capture is one of them; a skill named for a different noun would break the mapping from the
documented loop to the skill that serves it. Naming it for its destination (the inbox) was rejected
separately: that path is configurable, and a name is the wrong place to fix a value the store may move.

The collision with `ctxr-session-capture` is carried by the descriptions, which is where a harness selects:
this skill's leads with material arriving from outside the store, the session skill's with what a finished
session produced. `ctxr-rollup` and `ctxr-mission` already coexist this way over the same commands.

Renaming `ctxr-session-capture` instead was considered and rejected. `ctxr-session-summary` in particular
would name that skill for its own anti-trigger — its text already says a request for a session summary is
not a signal to fire — and would invite the recap it exists to prevent. It also ends in
`ctxr session capture --proposal <file>`, so under the first naming form above its name is a correspondence
to keep, not a collision to fix.

### D3 — The skill registers first in the owned-skill order

The skill array is index-ordered and asserted as such. Capture precedes ingest in the loop, and the rendered index should read in loop order, so the new seed goes ahead of `ctxr-ingest-orchestration` rather than at the end.

### D4 — One section per source type, not a list

`required_capture_sections` maps a source type to a single section name. A list would cover "transcript and attendees", but no store has asked for it, and the shape can be widened to accept either a name or a list of names later without breaking a store that declared a name — the narrow form stays valid under the wider one. Starting wide would be speculative generality in the one file the project treats as a record of decisions actually made.

### D5 — Enforcement at ingest, observation at lint, nothing at doctor

Ingest is where a capture stops being material and becomes provenance, so it is the only point where refusing is meaningful; it exits with the check code and writes nothing. `doctor` is wrong for this: it gates commits over the whole store, and material sitting in the inbox missing a section is not a broken store, it is material not yet ready — which is exactly the lint/doctor split the project already draws. `lint` already reports un-ingested inbox material, so the observation lands beside a report an operator is already reading.

### D6 — Section matching is level-agnostic, by heading text

A real capture's body mixes heading levels, because source-supplied content is pasted in as the source wrote it: a capture may carry `## Summary` whose contents are themselves `#`-level headings, then `## Transcript` after them. Pinning the declared section to a heading level would make the config depend on a capture's internal structure, which the skill deliberately does not normalize. So the match is on heading text at any level, trimmed, case-sensitive.

### D7 — No schema-version bump

The key is additive and optional. The config schema is loose by design so that a later version's additive field never fails an existing store's load, and `schema_version` gates store *shape* in both directions with nothing to bridge a mismatch — bumping it would refuse every existing store until each one is edited by hand, to deliver a key none of them is required to declare.

## Risks / Trade-offs

- **The backstop checks presence, not fidelity.** A capture can carry a `Transcript` heading over a summarized transcript and pass. → Accepted, and stated as such in the spec: no check can decide faithfulness. The presence check turns the most likely failure (the section is simply missing) from silent into loud, and the skill carries the rest. Claiming more would be a cage, not a gate.
- **A source-supplied summary could itself contain a heading matching the declared name**, producing a false pass. → Accepted as remote and low-consequence; tightening it would require parsing structure the capture deliberately preserves verbatim.
- **Capture through a connected source costs tokens where a store-local script costs none.** A scheduled script can run with no agent attached; material routed through an MCP server passes through the agent's context, transcripts included. → The trade is deliberate: zero connector maintenance in exchange for per-run tokens, which is the right side for a store that would otherwise carry its own vendor client. Recorded here so it is not rediscovered from a bill. The escape hatch is D1's vendored-skill option.
- **The skill can dead-end if no capture source is connected.** → The procedure is written to locate material among what is available and to ask rather than assume, so material a user supplies directly is on the same path; it does not require any server to be present.
- **Two owned skills now have "capture" in the name.** → D2's descriptions carry the disambiguation, and the two are reached from opposite ends of a session.

## Migration Plan

`openspec/changes/exclude-candidate-from-source-check/` **lands first.** `ctxr source check` currently reports `already_ingested` for a capture carrying only a source id — precisely the shape this skill instructs an agent to write — and the ingest-orchestration skill tells an agent that verdict means stop. Until that is fixed, step for step, the procedure this change ships dead-ends on its own output. There is no ordering constraint in the other direction.

Everything else is additive. Existing stores receive the skill on their next `ctxr update`, which overwrites managed skill copies. A store that declares nothing under the new key behaves exactly as before; the one store already declaring it gets the enforcement its configuration has been asserting. Rollback is removing the seed and the key — no store state is written by either, so nothing needs undoing in a store that already updated beyond a subsequent `ctxr update` removing the skill copy.
