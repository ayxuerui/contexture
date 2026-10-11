## Context

The evidence for this change is in proposal.md. The usage audit and the external survey were run on 2026-10-11 over
both downstream stores' git history, the Claude Code and Hermes session logs, and gbrain, Letta, Anthropic, and
Karpathy sources.

## Decisions

### D1. Keep a mission, but only its core

**Case for dropping it:** pkm shows that a document nobody refreshes is worse than none. Git history and the store
log can say what is current, and a wrong always-loaded goal steers agents wrongly.
**Why keep a core:**
- readyrun-brain's useful moment (2026-09-18) came from ranked judgment across bets, which no computation produces.
- Every system surveyed keeps some always-loaded purpose statement.
- What failed in pkm was the register and the freezing, not the idea of a stated priority order.

**Case for keeping it whole:** inlining is what put that judgment in front of an agent unasked.
**Why not:** the value came from about 2.6 KB of priorities, not the 4.7 KB of active builds or the 6.9 KB of
closed debt. Every-turn exposure did not keep pkm's version current.

**What would flip it:** agents ignoring a visibly dated core as they ignored the stale flag. The next step would
then be computed-only state.

### D2. The age is shown in the document itself, not judged by the generator

The confirmation date is rendered from the recorded timestamp, so the generated text stays deterministic and an
agent compares it to today itself. Rendering a "stale" banner would make `AGENTS.md` change with the calendar and
fail drift checks on days when nothing changed.

### D3. The budget fails doctor; staleness only lints

The size is fully in the store's control and is a cost on every turn, so it gets the same treatment as the
conventions budget. Staleness is a judgment only the operator can resolve, and failing `doctor` on it would block
CI on a calendar date.

### D4. The operator owns the ranking

gbrain renders its mission only from the operator's own verbatim answers, and the audit found no case of an agent
refreshing pkm's mission unprompted. A silent rewrite is how a priority list becomes the agent's view of the
operator's life. The skill proposes and the operator confirms. Factual status ("shipped", "blocked") is an agent's
to correct.
