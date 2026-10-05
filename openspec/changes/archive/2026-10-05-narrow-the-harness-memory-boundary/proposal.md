## Why

`harness-portability` tells every store, through the canonical section of its `AGENTS.md`, that "durable cross-session memory" belongs to the harness and not to the store. Read literally, that disclaims the store's own contents: a note written in one session and retrieved in the next *is* durable cross-session memory. The sentence draws its boundary with a word broader than the thing it means to exclude (#62).

`remove-agent-identity` drew this line, and its own rationale is narrower than the wording that landed. It was about a persona and about what an agent recalls of the user — "a persona, durable facts about the world, durable facts about the user" — validated against a store whose `.contexture/identity/*.md` byte-duplicated files the harness already owned. Nothing in that argument requires the store to disclaim durable knowledge, which is the one thing it exists to hold.

The broad wording costs in two places:

- **An agent reading `AGENTS.md` literally can conclude that facts worth recalling next session belong somewhere other than this store.** That is the opposite of what `ctxr-session-capture` exists to do, and the entry document is the one file every agent is told to read in full.
- **Any accurate description of the product contradicts it.** The README already draws the line where this change puts it ("Your harness keeps what an agent knows about you and itself; contexture keeps what *you* know"), after several drafts on #59 that kept colliding with this sentence.

## What Changes

- The canonical section's boundary statement narrows from "identity, persona, and durable cross-session memory" to **identity, persona, and the agent's conversational recall — what it remembers of the user and of itself** — and adds the half the old sentence left implicit: subject-matter knowledge, including anything worth finding again in a later session, belongs to the store.
- The rendered subsection heading changes from "Identity and memory" to "Identity and recall", so the heading does not reassert the term the body stops using.
- The rest of the requirement is unchanged: the statement references the skills path rather than inlining content, names no identity file or path, and introduces no configuration key, command, or adapter kind for identity.
- Existing stores pick up the new wording on their next `ctxr update` (or `ctxr init` against an existing store), which already rewrites every generated `AGENTS.md` section. No schema migration and no `schema_version` bump.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: two requirements are MODIFIED, each carried in full.
  - "The canonical section states the harness/store identity boundary" — the requirement text and its "boundary statement is present" scenario narrow the harness's share and name the store's. The byte-stability scenario is carried unchanged.
  - "`AGENTS.md` is the canonical entry document" — only its "Reading only `AGENTS.md` is sufficient" scenario changes, to describe the narrowed statement. Its requirement text and other three scenarios are carried unchanged.

## Non-goals

- **Moving the boundary.** Contexture does not take on any part of the agent's recall of the user or of itself — no persona file, no memory tool, no capture of conversational facts. That would reopen `remove-agent-identity` and is a product decision that needs its own proposal argued on its own merits (design.md D1 argues the case and declines it).
- **Changing what `ctxr-session-capture` captures.** Its contract already narrowed to store notes in `remove-agent-identity`. This change only stops the entry document from appearing to contradict it.
- **A doctor check for a stale canonical section.** `ctxr doctor`'s drift check covers the inlined conventions and the mission, whose sources live in the store. The canonical section's source ships with the CLI and is refreshed by `ctxr update`; adding a check for it is unrelated to this wording fix (design.md, Risks).
- **Rewording the README.** It already says what this change makes the entry document say.

## Impact

- `templates/agents/canonical.md`: the "Identity and memory" subsection (heading and its one paragraph) is replaced with the wording recorded in design.md D2.
- `test/unit/agents-doc.test.ts`: the boundary assertion (~line 211) and the full-section golden (~line 627) are updated to the new wording, and the boundary assertion gains a check that the store's share is stated.
- `openspec/specs/harness-portability/spec.md`: the two requirements above, at archive.
- No change to `src/`. `reconcileStore` (`src/core/reconcile.ts`) already re-renders the canonical section on every `update`; see design.md D4.
- Downstream stores (pkm, readyrun-brain) see a one-section `AGENTS.md` diff on their first `ctxr update` after the release that carries this.
