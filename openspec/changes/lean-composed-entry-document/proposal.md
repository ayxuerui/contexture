## Why

`AGENTS.md` is the one file every harness loads before doing anything, and contexture currently builds it by inlining
everything: the store fundamentals, the whole mission document, three operating sections, the shipped baseline, and
every operator convention file in full. The downstream stores' copies are 50,770 and 35,869 bytes. Two of the
harnesses those stores now target cut the file off silently: Codex at 32,768 bytes and Antigravity at about 24,000
bytes (measured in `support-codex-and-antigravity-harnesses`). The part that falls off is the operator's
conventions, because they render last.

Truncation is the acute problem, but it is not the only one. The research behind this change (gbrain, Karpathy's LLM
wiki, Letta memory blocks, Anthropic's, OpenAI's, and Google's instruction-file guidance, and two studies) agrees on
one thing: always-loaded text has a cost on every turn, and a longer file is followed *less* reliably, not more.
`Evaluating AGENTS.md` (ICLR 2026) measured that context files slightly reduce task success and raise cost by more than
20%. gbrain, the closest product to a contexture store, keeps its `AGENTS.md` at 19.3 KB as a router ("when you're
working on X, read Y first") and enforces byte caps in CI after an append-only index once grew its always-loaded docs
to 592 KB.

An audit of the two stores found that the content actually needed on every turn is about 5 KB in one and 7 KB in the
other. The rest is detail for one task, text duplicated in a shipped skill, or stale. And contexture's own generated
prose is 12 KB, half of Antigravity's budget before a store adds anything.

## What Changes

- **The entry document becomes a composition with a budget.** Its parts are, in order: fundamentals, mission,
  retrieval, capture, placement, the conventions that load on every turn, and a new **guidance index**.
- **A guidance document can load on demand.** A convention file whose frontmatter declares `read_when` (a one-line
  trigger such as "Before a research pass or recording evidence") is no longer inlined. The guidance index lists it as
  one row: its title, its trigger, and its path. A file without `read_when` is inlined exactly as today, so a store
  that changes nothing renders the same conventions as before.
- **The entry document is held to the harnesses that read it.**
  - `ctxr doctor` fails when `AGENTS.md` is larger than the smallest read limit among the store's declared harnesses.
    The limits are the per-harness ones `support-codex-and-antigravity-harnesses` adds. The failure names the harness,
    the size, the limit, and the section the cut falls in.
  - `ctxr lint` reports when `AGENTS.md` exceeds a target size, `harness.entry_document_target_bytes`, which defaults
    to 20,480 bytes. That leaves headroom under Antigravity's 24,000.
- **contexture's own generated prose shrinks, and a test keeps it shrunk.**
  - The fundamentals, retrieval, capture, and baseline templates are rewritten to their every-turn content.
  - Procedure that a shipped skill already carries is left to that skill: the ingest walkthrough, the five
    `source check` verdicts, and the landing steps.
  - An automated test fails when the contexture-owned sections of a freshly initialized store's `AGENTS.md` exceed a
    shipped ceiling. The ceiling only goes down.
- **The staged pre-commit check and `ctxr doctor`'s drift check cover the index too.** Changing an on-demand file's
  title or trigger without regenerating `AGENTS.md` is drift, exactly as editing an inlined file is.

## Non-goals

- **Moving the mission out of the entry document.** The mission is still inlined whole, and it counts toward the
  budget like everything else. Whether contexture should give it a section budget, or inline only a current-state
  part, is open (design.md, Open Questions). It is the operator's content, and the operator has not chosen yet.
- **Restructuring any store's content.** Splitting a store's house conventions into on-demand topic files, and trimming
  its mission, are edits in that store's own repository. This change only makes them expressible and measurable.
- **A per-skill overlay mechanism.** Store-specific additions to a shipped skill, such as "session lifecycle: store
  specifics", become ordinary on-demand guidance with a trigger naming the skill. Every declared harness discovers
  skills on its own, and a guidance-index row is enough to route to the addition (design.md D4).
- **Harness-specific rule files.** Antigravity's `.agents/rules/` with activation modes, and Claude Code's
  path-scoped rules, are each read by only one harness. The guidance index works in every harness that reads
  `AGENTS.md`.
- **Removing `harness.convention_max_bytes`.** It still bounds the inlined conventions section, which is now a subset.
  Retiring it would need a migration step for the store that set it explicitly, and buys nothing this change needs.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: conventions with `read_when` are routed rather than inlined; the entry document gains a
  guidance index section, a whole-document size budget against declared harnesses' read limits and a target, and a
  guarded ceiling on contexture's own generated prose. The canonical-entry-document, fixed-order, and drift
  requirements are revised to match.
- `store-integrity`: doctor's enumerated checks include the entry document staying within every declared harness's
  read limit.

## Impact

- `src/core/conventions.ts`: `ScannedDoc` gains `readWhen`.
- `src/core/agents-doc.ts`:
  - The conventions section renders only the docs without `read_when`.
  - A new guidance-index fence, with its renderer and build function, is added to `AGENTS_MD_SECTION_ORDER`.
  - The drift check covers the index.
- `src/core/reconcile.ts`: calls the new build function.
- `src/core/checks/integrity-checks.ts`: the staged drift check covers the index.
- `src/core/checks/harness-portability-checks.ts`: the read-limit (doctor) and target (lint) checks.
- `src/config/schema.ts` and `defaults.ts`: `harness.entry_document_target_bytes`, a convention key with a shipped
  default.
- `templates/agents/*.md` and `templates/conventions/baseline-conventions.md`: rewritten shorter.
  `templates/agents/guidance-index.md` is new. `templates/conventions/house-conventions-seed.md` documents
  `read_when` in its comment.
- Tests: the existing `AGENTS.md` assertions are updated to the shorter templates, plus a new generated-size ceiling
  test.
- Depends on `support-codex-and-antigravity-harnesses` for the per-harness read limits. That change's lint-only size
  observation is dropped in favor of this change's doctor check.
- Downstream: existing stores render the same conventions until their operator adds `read_when`. A store that declares
  Codex or Antigravity and is over the limit fails `doctor` until it is split or trimmed. That failure is the point of
  the change.
