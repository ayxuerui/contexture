## Context

See proposal.md — Why. Three existing facts set the shape of this change:

- The boundary statement is one paragraph under one subsection of `templates/agents/canonical.md`, rendered into the fenced `canonical` section of every store's `AGENTS.md` by `renderCanonicalSection` (`src/core/agents-doc.ts`). The only substitution in it is `__SKILLS_PATH__`. Changing the wording is a template edit, with no change to `src/`.
- `test/unit/agents-doc.test.ts` asserts it twice: a loose regex across three config fixtures (~line 211, `/identity.*persona.*(durable )?cross-session memory/is`, plus `harness` and no `identity/` path), and a golden of the whole rendered section (~line 627).
- `reconcileStore` (`src/core/reconcile.ts`) runs `buildAgentsCanonicalSection` on every `ctxr update` and on `ctxr init` against an existing store. That rewrites the fenced region from the installed template. This is what makes a migration unnecessary (D4).

## Goals / Non-Goals

**Goals:**

- The entry document stops disclaiming durable knowledge, and says plainly that the store is where it goes.
- The part of the line `remove-agent-identity` actually meant to draw stays drawn: a persona, and the agent's recall of the user and of itself, stay with the harness, and the store carries no file for either.
- Existing stores converge on their next `ctxr update`, with no new mechanism.

**Non-Goals (design-level, beyond the proposal's):**

- No new check that the canonical section is current. Argued under Risks.
- No change to the requirement's name or to any scenario's name. D5.

## Decisions

### D1 — Narrow the boundary; do not keep it broad and do not move it

There are two alternatives to narrowing, and each has a real case.

**The case for keeping the broad wording.** "Durable cross-session memory belongs to the harness" is a bright line an agent can apply without judgment. Anything that looks like memory goes to the harness, so the store never grows a `MEMORY.md`. Narrowing it to "conversational recall" brings back a judgment call at the edge. A fact like "the user is migrating the billing service to Postgres" is about the user, and it is also subject matter. Any line drawn by meaning will have cases like that, and an agent that guesses wrong under the narrow wording writes a harness-shaped fact into the store or the reverse. The broad sentence has also shipped since 0.x without a reported misfiling.

That argument fails on where the line sits, not on how sharp it is. A bright line that, read literally, excludes the store's own purpose doesn't help the agent judge. It tells the agent the wrong answer about the most common case, which is a fact worth finding again next session. `ctxr-session-capture` exists to put exactly that in the store. The edge cases are real but small, and the narrowed wording settles them with one test: is this about the agent as a conversational partner (how the user likes answers, what the agent calls itself) or about the subject the store covers? The billing migration is subject matter and goes in a note. The bright-line part that mattered is that the store never carries a persona or recall file, and that rule stays, as the paragraph's closing clause. As for no reported misfiling: an agent that wrongly declined to capture something leaves no trace to report.

**The case for moving the boundary so contexture owns agent memory.** Contexture's premise is harness portability. The store is the one thing that travels across Claude Code, Codex, Cursor, a cron job, and a human at a terminal. Harness memory does not travel. Hermes has `MEMORY.md`/`USER.md`, Claude Code has its own mechanism, and a cron job or Codex session may have nothing. So "the user prefers terse answers" is learned in one harness and lost in every other. If the store is where things persist across tools, the agent's recall of the user arguably belongs there too, and the industry's "agent memory" category is the one this product sits in.

That argument is declined, and not only because it is a product decision beyond a wording fix. `remove-agent-identity` tested it against a real store and found the store copy was a stale, manually refreshed duplicate of what the harness owned live. The harness owns it live behind a memory tool with character caps and unique-match edits. The store's write path is also the wrong cadence for conversational recall. Every write lands through a session worktree and a reviewed pull request, which is right for knowledge and absurd for "the user said to stop summarizing at the end." And the gap it would close is narrower than it looks. Anything about the user that is durable *and* useful across tools is usually subject matter ("works in UTC+8", "owns the billing service"), and the narrowed wording now explicitly lets it be a note. If a store-level recall layer is wanted later, it gets its own proposal, as `remove-agent-identity`'s Non-goals already require.

**Settled:** narrow the harness's share to identity, persona, and conversational recall, and keep the no-file clause.

### D2 — The exact wording

`templates/agents/canonical.md` lines 21–23 become:

```markdown
### Identity and recall

Identity, persona, and the agent's conversational recall — what it remembers of the user and of itself from one session to the next — belong to its harness, not to this store. Subject-matter knowledge belongs here, including anything worth finding again in a later session: the store holds knowledge and skills, documented as portable markdown under `__SKILLS_PATH__`, and never a persona or recall file of its own.
```

Rendered with the default skills path, the paragraph reads `` …under `skills/`, and never a persona or recall file of its own. ``

Choices inside it:

- **"conversational recall", glossed in place.** The issue offered "persona and conversational recall" and "the agent's durable recall of the user and of itself". The first is shorter but jargon on its own. An agent can't tell from the phrase whether a note it just wrote counts. The gloss after the dash is the operational test, so both phrases go in: the term, then what it means.
- **"the user", not "the operator".** The canonical section uses "operator" for the person who asks to wrap up a session. Here the subject is whoever the agent converses with, which is the harness's own frame (Hermes keeps it in `USER.md`). It is not necessarily the store's operator. Clarity where it is read wins over matching the neighboring paragraph.
- **"recall file", not "memory file".** Keeping "memory file" would put the umbrella word back in the one sentence written to stop using it. "Recall file" names the thing excluded by the term the paragraph just defined.
- **Heading "Identity and recall".** A heading saying "memory" over a body that hands durable knowledge to the store would contradict the body.
- **No tier words.** The shipped-prose ban on *personal, private, public, shared, internal, team, confidential* is enforced by `test/unit/skills.test.ts`, which iterates rendered skills only, so it does not cover `templates/agents/*.md`. The wording obeys it regardless and contains none of the seven. Task 1.2 checks this with a grep.

### D3 — State the store's share, not only the harness's

The narrowed sentence could have stopped after "belong to its harness, not to this store". It does not, because the hazard in #62 is an agent concluding that recall-worthy facts go *elsewhere*, and narrowing the harness clause only removes the false statement. It does not replace it with the true one. One clause naming subject-matter knowledge as the store's, including what is worth finding in a later session, closes the literal reading in the direction `ctxr-session-capture` needs. The requirement and its "present on every store" scenario carry this half too, so a test asserts it and later rewording can't silently drop it.

### D4 — No migration: `ctxr update` already regenerates the section

#62 lists "a migration so existing stores regenerate the canonical section" in scope. One is not needed, and adding one would be wrong:

- `reconcileStore` (`src/core/reconcile.ts`) calls `buildAgentsCanonicalSection` unconditionally on every run. That is `upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CANONICAL_FENCE, renderCanonicalSection(config))`, which replaces the fenced region with the installed template's render. `ctxr update` calls `reconcileStore` after any config migration, and so does `ctxr init` on an existing store. So the first `update` after the release rewrites the paragraph, reports `AGENTS.md` as changed, and a second `update` reports nothing.
- The migration ladder that `migrate-stores-on-update` reinstated rewrites the raw `contexture.yaml` document across `schema_version` bumps. Nothing in `contexture.yaml` changes here, so there is no step to write and no version to bump. Bumping `schema_version` to force a step would make every older CLI refuse the store for a prose change.
- Operator content outside the fence is untouched, as with every generated section.

### D5 — Keep the requirement and scenario names

"The canonical section states the harness/store identity boundary" is still accurate: it is still an identity boundary, just drawn precisely. The scenario names ("The boundary statement is present on every store", "A second generation is byte-stable", "Reading only `AGENTS.md` is sufficient") don't mention memory either. Keeping all of them means both MODIFIED deltas carry every scenario under its existing name and change only bodies. That is the delta shape OpenSpec accepts without a parent-requirement rename.

## Risks / Trade-offs

- **[A store keeps the old wording until its next `update`]** → `ctxr doctor`'s drift check (`checkAgentsMdDrift`) covers only the inlined conventions and the mission, whose sources live in the store. It does not cover the canonical section, whose source ships with the CLI. So a store that is not updated carries the broad sentence with no finding. Accepted: that is the status quo today, and the release-propagation path (`ctxr-upgrade`, and the image pull for hermes-based stores) already ends in `ctxr update`. A check comparing every generated section with the installed render would be a separate change, about generated-section staleness in general.
- **[An older CLI reverts the wording]** → `ctxr update` from a release before this one re-renders that release's template and puts the broad sentence back. This is the same failure mode as any older CLI touching a newer store's generated content, and it is visible as an `AGENTS.md` diff in the update's pull request. No mitigation specific to this change.
- **[The edge between recall and knowledge stays a judgment call]** → D1 accepts it and supplies the test in the gloss. If agents misfile in practice, the remedy is a sentence in the capture skill, not reverting to a line drawn in the wrong place.
- **[Downstream review churn]** → pkm and readyrun-brain each get a one-paragraph `AGENTS.md` diff on their next update. Small, and expected from a release.

## Migration Plan

None beyond the release itself. Ship the template and test change, then cut a release. Each store converges on its next `ctxr update` (D4). To roll back, revert the template, and the next `update` restores the old paragraph.
