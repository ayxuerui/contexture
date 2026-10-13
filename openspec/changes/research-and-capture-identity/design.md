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

### D4. An archived item keeps its path beneath the destination

`ctxr archive projects/Bet` lands at `<destination>projects/Bet`, and a note at `<destination><its path>`. The
first draft of this change kept the 0.21.0 flat rule: a note archived to `<destination><filename>`, a folder
under its own name.

**The case for flat:** the destination stays one configured path, independent of taxonomy names, so a store
whose folders are not PARA layers still works. Wikilinks resolve by stem, so no link depends on where the
archive puts a note. And git history already records where it came from.

**Why the path is kept anyway:**
- The folder layout is the one place a reader or agent sees what an archived item *was* without reading git
  history, and it is where the item goes back to if it is revived (the reverse rename).
- Flat archiving drifts from what stores already do by hand: pkm's `archives/projects/` and `archives/areas/`
  mirror its live layers, and its convention document existed partly to say so.
- Taxonomy independence holds. The command copies the source path as it is and never reads the layer list, so
  `projects/`, `10-work/` or no layer folders at all behave the same.

**Cost:** a store that archived flat under 0.21.0 now has two layouts in its archive. Nothing reads the archive's
layout, and links resolve by stem, so the older flat notes need no migration. An item already beneath the
destination is refused, so an archive is never nested inside itself.

### D5. Retirement records and the mission ride on the skill, not the command

pkm's archive skill also prepended a completion banner and took the item off the mission. Both are judgment,
not mechanics: the command cannot know what happened or whether the item was a priority. `ctxr-organize-audit`
says to record, past tense, what happened and when (in the hub for a folder, a banner for a single note) and to
hand a retired priority to `ctxr-mission`, which proposes the change rather than writing it.
