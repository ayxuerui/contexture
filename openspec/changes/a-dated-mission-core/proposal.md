## Why

Every store's mission is inlined into `AGENTS.md` on every turn, and in both downstream stores it had become the
largest and least reliable part of the file.

- **readyrun-brain** (11.6 KB, half of `AGENTS.md`) is genuinely used. On 2026-09-18 its cross-bet synthesis
  surfaced a kill criterion that led to a narrowing PR. But 40% of it copies the Overviews' next actions, and 4 of
  its 11 dated actions are past due.
- **pkm** (9.4 KB) has priorities unchanged since the day it was written, which were wrong then: it names a day job
  the operator had already resigned from, and it omits the store's most active project. 73% of it is a log of closed
  debt. It has been flagged stale on every submit for two weeks and never refreshed.

Research on comparable systems (gbrain, Letta, Anthropic's long-running-agent harness, Karpathy's LLM wiki) points
the same way:
- every one keeps a short, always-loaded statement of purpose;
- none inlines a register of back-burner work or debt;
- the ones that work check freshness mechanically.

The evidence also says a wrong always-loaded goal is actively harmful: agents follow context files, and fixate on
goals that no longer hold.

## What Changes

- **The mission becomes a dated core.**
  - The "Mission" section renders a "last confirmed" line from the document's rollup timestamp, so every agent sees
    how old the priorities are.
  - `ctxr doctor` fails when the mission body exceeds `organize.mission_max_bytes` (default 2,048 bytes).
- **The redundant "Load the mission at the start of every session" pointer goes.** The content is already inlined,
  and the pointer caused ritual re-reads, including by scheduled jobs.
- **`ctxr lint` reports a stale mission on every run**, not only when the staleness query is called directly. It
  also reports past-due dates (`due YYYY-MM-DD` earlier than today) in the mission.
- **`ctxr-mission` writes a core, not a register.**
  - The core holds the primary mission, the top priorities ranked, and what is not now.
  - The back burner, sunset candidates and open debt go to a register note the core links to.
  - Closed debt is recorded in the store log and removed.
  - The agent proposes changes to the mission or ranking, and writes them only on the operator's confirmation. It
    may correct factual status on its own.

## Non-goals

- **Computing current state from notes.** readyrun-brain's Overviews could generate its active-builds list, but
  the core's value is ranked judgment that no computation produces. A computed status view is a separate question.
- **Blocking on staleness.** A stale mission is reported, never a `doctor` failure: its age is visible in every
  session, and only the operator can confirm priorities.
- **Rewriting any store's mission.** Each store's core is drafted for its operator's confirmation in that store's
  repository.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`:
  - the mission section is dated and budgeted;
  - the canonical section drops its load pointer;
  - the mission skill writes a core and a register, and proposes before writing.
- `context-organize`: `lint` reports a stale or past-due mission.

## Impact

- `src/core/agents-doc.ts`: the mission pointer is removed from the canonical section, and the confirmation line is
  added. `templates/agents/canonical.md` and `templates/agents/mission.md` change with it.
- `src/config/schema.ts` and `defaults.ts`: `organize.mission_max_bytes`.
- `src/core/checks/`:
  - a mission budget check (invariant);
  - the mission path passed to the rollup-stale observation;
  - a mission past-due observation.
- `templates/skills/ctxr-mission.md` is rewritten.
- Depends on `lean-composed-entry-document`, whose modified "canonical entry document" requirement this change
  modifies again.
