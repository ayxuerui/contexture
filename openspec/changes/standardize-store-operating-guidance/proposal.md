## Why

Splitting pkm's 29 KB house conventions for `lean-composed-entry-document` showed that most of it was not about pkm.
It restated, refined, or worked around contexture's own procedures:

- the pull-request routes and the questions a PR body answers;
- the stale-rollup check that belongs inside a submit;
- when a second opinion is required, and where its verdict lands;
- how a stale catalog gloss is confirmed (the frozen hash, stripped once, re-stamped by the next build);
- that the graph is a per-checkout cache, built when `doctor` says so;
- what to do when a literal search finds nothing.

Every store would write the same thing in its own words, and pkm's copy had already drifted from the generated text
in two places. The operator's direction: harnesses provide the skills, and everything other than a store's house
conventions is standardized in contexture.

## What Changes

- **`ctxr-submit`** names the three routes a pull request takes and asks the agent to state its route:
  - a *session* PR (the session's work and its approved capture, the default);
  - an *own* PR (a new skill, a structural or entry-document change, a large refactor);
  - a *housekeeping* PR (batched cheap appends, never folded into unrelated work).

  Its re-scan checks for stale rollups on the entities the session touched, offering `ctxr-rollup` and never running
  it unasked. The PR body answers five questions: why, what changed, route, verification, follow-ups.
- **`ctxr-second-opinion`** makes a critique *required*, not optional, before implementing a change that is
  architectural, irreversible, or touches a confidentiality boundary, run before the work rather than after it. The
  verdict and its reasoning land in the PR body: for a structural change, the PR and its commit are the decision
  record, with no separate governance process.
- **`ctxr-derived-artifacts`** states how to confirm a gloss that `catalog check --stale` or `doctor` flagged: review
  it, strip its `<!-- hash:… -->` once, and rebuild. Editing the gloss alone does not clear the finding, because the
  hash is frozen by design. It also states that the graph is a per-checkout cache, built at the point of use when
  `doctor` reports it stale, and never on a schedule.
- **The baseline conventions carry the every-turn rules any store would write.** The operator ruled each of these
  general when triaging pkm's conventions:
  - outliner bullets and wikilinks;
  - preserve a note's content;
  - the task checkbox format;
  - no credentials (last four digits only);
  - scratch files outside the store, in a configured `harness.scratch_path` (default `/tmp/`);
  - no access control on notes, so sensitive material is placed deliberately.
- **A store log becomes standard.** `organize.log_path` defaults to `log.md` and is excluded from retrieval.
  Entries take the form `## [YYYY-MM-DD] <kind> | <title>`. `ctxr-ingest-orchestration` and `ctxr-organize-audit`
  append to it, and the baseline suggests a lint pass at session start when the last `lint` entry is over seven
  days old.
- **`ctxr-capture`** states that a capture keeps the durable mechanic, not perishable state, and that a file a note
  links to or displays (a PDF, an image) lives under the capture root's `assets/`.
- **`ctxr-submit`** states the `gh` credential practice (never export `GH_TOKEN`, never rewrite the origin) and a
  default branch-prefix vocabulary.
- **The retrieval section** gains one fallback line for a literal search that finds nothing: try the vocabulary the
  note would use, expand acronyms, and walk the graph from the nearest note found. The fallback stays within the
  generated-prose ceiling.

- **The generated-prose ceiling rises** to cover the baseline additions. These are every-turn rules moving out of
  stores and into contexture's share, so a store's `AGENTS.md` shrinks by more than contexture's grows
  (design.md D4).

## Non-goals

- **A `ctxr catalog confirm` command.** Confirming a gloss by stripping its hash is the existing designed mechanism,
  and only its documentation was missing. A command is a reasonable follow-up, but it is a CLI surface change of its
  own.
- **Enforcing PR routes or body sections.** They are skill procedure, stated for the agent to follow. Nothing here
  checks a PR.
- **Per-store overlays of these procedures.** A store that genuinely differs says so in its house conventions; there
  is no overlay mechanism (`lean-composed-entry-document` D4).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: the shipped submit, second-opinion, and derived-artifacts skills and the retrieval section
  carry the operating guidance listed above.

## Impact

- Templates: `templates/skills/ctxr-submit.md`, `templates/skills/ctxr-second-opinion.md`,
  `templates/skills/ctxr-derived-artifacts.md`, `templates/agents/retrieval-leg-routing.md`.
- Tests: `test/unit/skills.test.ts` (one assertion per scenario), and the existing exact-output fixture for the
  retrieval section.
- Config: `harness.scratch_path` and `organize.log_path`, convention keys with shipped defaults. The log path joins
  the retrieval exclusions.
- Downstream: pkm's house conventions shrink to its store context and house-taste lens (pkm#339).
