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
- **The retrieval section** gains one fallback line for a literal search that finds nothing: try the vocabulary the
  note would use, expand acronyms, and walk the graph from the nearest note found. The fallback stays within the
  generated-prose ceiling.

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
- Downstream: pkm's house conventions shrink to what is actually pkm's (pkm#339).
