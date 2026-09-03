## Why

`AGENTS.md` is meant to be the one file an agent needs to be fully oriented in a store (per
harness-portability's own "Reading only `AGENTS.md` is sufficient" scenario), but today it fails that
test twice over. First, 77% of a typical rendered file is the skill index — a full name+description
line for every file at `harness.skills_path` — and on any harness with native skill auto-discovery
(Claude Code, and others with the same pattern) that content is already loaded into the agent's system
prompt before `AGENTS.md` is ever read, so the index is pure duplication paid on every session. Second,
the two documents that actually describe *this* store's operating knowledge — its operator conventions
and its current-state mission document — are only ever referenced by a path the agent may or may not
follow, so the file that is supposed to be sufficient on its own routinely isn't.

Net effect: most of the file's bytes are redundant, and the two sections that matter most are one line
each. This change removes the duplication and inlines the content, so `AGENTS.md` is actually
self-contained.

## What Changes

- **BREAKING**: The `AGENTS.md` skill index is removed. `AGENTS.md` no longer lists every skill file's
  name and description; a harness without native skill discovery reaches skills by browsing the
  configured skills path directly, or through an operator-authored index in its own conventions (as
  the PKM store's `vault-conventions.md` already does, more usefully — grouped, with disambiguations —
  than the flat generated list it replaces).
- **BREAKING**: Operator convention documents are inlined into `AGENTS.md`'s "Store conventions"
  section (heading-demoted body, with a provenance line), replacing the current index-of-links
  rendering. The empty-store case (no convention files) is unchanged.
- A new "Mission" section inlines the configured mission document's body (when `organize.mission_path`
  is set), replacing today's one-line pointer. Nothing renders when unset, as before.
- The generated sections are reordered: hard rules and current state first (store fundamentals,
  mission), operating mechanics next (retrieval, capture, placement), the long operator reference last
  (store conventions).
- Two rendering bugs fixed: the retrieval section's exclusion-path list collapses ancestor/descendant
  duplicates into one compact line instead of ~20 redundant bullets; index-line rendering (still used
  by the empty-conventions branch) normalizes embedded whitespace so a multi-line frontmatter
  description can no longer produce a stray blank line mid-document.
- `AGENTS.md`'s inlined content is kept from drifting out of sync with its sources: `ctxr doctor` gains
  a check that the inlined conventions/mission bodies match the files on disk; a `rollup write` to the
  configured mission path also refreshes the entry document in the same operation; the pre-commit hook
  refuses a commit that would leave the entry document stale relative to staged convention or mission
  changes.
- `ctxr verify --portable`'s skill-index scenario is replaced: portability is now verified by confirming
  every managed section renders (including the inlined conventions/mission, when configured) and that
  the configured skills path exists and is populated, rather than by cross-checking a now-removed index.
- The executable portability test's "follow one skill via the `AGENTS.md` index" step changes to
  "follow one skill by path at the configured skills path," since there is no longer an index to follow
  it through.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `harness-portability`: replaces the skill-index requirement and the conventions-as-links requirement;
  updates the canonical-entry-document requirement's "sufficiency" scenario, the identity-boundary
  pointer text, and the executable-portability-test requirement; adds a mission-inlining requirement
  and a drift-detection requirement covering doctor, `rollup write`, and the pre-commit hook.

## Impact

- **Code**: `src/core/agents-doc.ts` (all five section renderers plus a new mission renderer and section
  reordering), `src/core/conventions.ts` (new body-inlining helper), `src/core/fs/fenced-region.ts` (new
  reorder primitive), `src/core/reconcile.ts` and `src/commands/init.ts` (register the mission builder,
  call reordering), `src/commands/rollup-write.ts` (refresh the mission section after a mission write),
  `src/commands/verify.ts` (redefined `--portable` contract), `src/core/checks/integrity-checks.ts` (new
  drift check), `templates/agents/*.md` (canonical, store-conventions, new mission and entry-header
  templates), `templates/skills/ctxr-mission.md` (its mission-path resolution no longer reads it from
  the canonical section's pointer text), `templates/hooks/pre-commit.sh` (staleness guard).
- **Tests**: every exact-output assertion in `test/unit/agents-doc.test.ts` and
  `test/unit/conventions.test.ts`; the "never inlined" assertions in
  `test/integration/adapters-and-entry-doc.test.ts`; `test/unit/verify-command.test.ts`'s skill-index
  scenarios; `test/integration/owned-skills.test.ts`'s index-growth assertions.
- **Every existing store**: `ctxr update` changes every store's `AGENTS.md` on next run — this is an
  intentional default-behavior change (not gated behind a config key), so an operator running `ctxr
  update` after upgrading sees their `AGENTS.md` grow (conventions/mission inlined) and shrink (skill
  index gone) in the same regeneration.
- **Downstream**: the PKM vault (a consumer store) picks this up via its own `ctxr update` inside a
  session, not by hand-editing `AGENTS.md`.

## Non-goals

- **Configurability of the skill index.** Considered and rejected: a `harness.skill_index: full | names
  | off` toggle would let stores opt back into the old behavior, but every harness this project
  currently targets either auto-discovers skills natively (making the index pure duplication) or is
  the flat-file/no-discovery case the "Skills are portable markdown reached by path" requirement
  already covers without an index. A toggle would keep two code paths alive for a distinction with no
  real audience yet; add one if a harness that needs it shows up.
- **Scope-aware or audience-filtered mission/conventions inlining.** The mission document may carry a
  visibility value narrower than the store's default (the PKM store's `mission.md` is `scope: personal`
  while `AGENTS.md` is read in every context); this change inlines it unconditionally, matching today's
  de facto behavior (the current pointer already says "load at the start of every session" with no
  scope gate) rather than introducing new visibility-filtering machinery into entry-document generation.
  A store that cannot accept this should leave `organize.mission_path` unset.
- **Renaming or restructuring `.contexture/conventions/`.** This change inlines whatever convention
  files exist at the configured path; it does not change how many files a store may have there or how
  they're organized.
- **A ranked or semantic replacement for the removed skill index.** Out of scope for this change and
  for contexture's stated v1 retrieval design (catalog + graph + grep, no ranker).
