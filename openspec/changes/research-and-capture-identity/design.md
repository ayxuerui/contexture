## Decisions

### D1. Research is a judgment skill that drives the harness's web access

**Case against shipping it:** contexture deliberately fetches nothing. The transport is whatever the harness has
connected, and a research skill pulls contexture toward being a research agent instead of a store.
**Why ship it:**
- `ctxr-second-opinion` is the precedent: a judgment skill that drives tools outside contexture while the
  transport stays the harness's.
- This procedure fetches nothing of its own. It tells the agent how to question, tier, reconcile and review,
  using whatever search, fetch or browser the harness provides.
- Its landing step is contexture's own (capture, ingest orchestration, placement).

Browser setups differ by harness and by machine, so the skill names none. A store that routes its browser
particularly (pkm's `agent-browser-routing`) keeps that in its own skill, and the shipped skill says to follow
it.

**Naming:** `ctxr-research` is named for the judgment, since no `ctxr research` command exists.

### D2. Tiers as rules, not a domain list

pkm's `source_tier.py` classified URLs from a hand-kept list of domains. A list goes stale and encodes one
operator's lens. The tier definitions (primary, secondary, weak, unreliable) are what the agent needs to apply,
and they ship as prose. A store wanting a classifier can keep one as its own script.

### D3. The prefix check is a refusal, not a correction

Prepending the type silently would accept a mistake: a bare id often means the agent took the id from the wrong
field. Refusing names both forms, and costs one retry.

### D4. A folder lands under its own name

A note archives flat into the destination. A folder keeps its name, so its notes stay together and its
internal links still read as a unit. The destination stays the single configured path: no layer-mirroring
sub-path, so the archive destination remains taxonomy-independent.
