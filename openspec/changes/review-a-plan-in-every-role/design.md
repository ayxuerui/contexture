# Design

## Context

`ctxr second-opinion critique` asks up to four model families to review a written plan. `ROLE_CLI` in `lineup.ts` ties one role to each family, `critiquePrompt(role, plan)` joins the critic contract to that role's persona template, and `judgeCritique` reads one `## Verdict:` line and the `### F<n>` blocks under it.

Two inputs led here. A poll of the four families on 2026-11-25 had three choose "every model covers every role" and one, Grok, argue against it: a model writing four roles collapses them into one voice. A literature review found that mixing model families matters more than mixing personas, that most real defects in a multi-model review are raised by one model only, and that joint judging of several criteria hurt older models. Neither settled it, so the setups were measured (proposal.md, Why).

The word for the four stances is **role** in this change, in the code and in the skill. The conversation that led here said "lens", but `--lens` already names the taste lenses of a poll, and a reader of the skill would meet both.

## Goals / Non-Goals

**Goals:**
- Every role is reviewed by every critic in the run, whatever the number of critics.
- The same number of requests as today: one per critic.
- The harness that measured this is in the repository and can be rerun.

**Non-Goals:**
- Keeping the fixed pairing available.
- Shipping the sixteen-request grid as a mode.
- A release gate on the harness.

## Decisions

### D1. One answer in four sections, for every critic

Each critic receives the contract, the four role texts and the plan, and answers with one overall verdict and four `## Role: <name>` sections.

The case for the alternatives was taken seriously:

- **Keep the pairing and rotate it per run.** Cheapest, and it keeps each answer short and single-minded, which is Grok's point. But a role still gets one model's read per run: rotation's measured mean was 93.5% on the longer plans against 100%, and a run of two critics still drops two roles.
- **Two roles per critic.** Halves the load on one answer while giving each role two reads. It is the fallback if a later harness run shows the sectioned answer thinning out. It was not measured, and it leaves the choice of which roles share an answer as a new thing to get wrong.
- **Once per role, sixteen requests.** Each answer keeps a single focus. Measured, it found nothing more, and only 47% to 51% of its matched findings were in the answer's own role: asked for one role, a model still reports the plan's most obvious defects. The sectioned answer filed 84% to 93% under the right role, because it can see where each finding belongs.

Grok's objection predicts that a role's section finds less than a dedicated answer would. On the measured plans a model's sectioned answer found as many planted defects as its four single-role answers together, or more (GPT: 94.4% against 81.3% on the longer plans). The objection is untested on harder defects, and D6 is how it would be tested.

### D2. The answer's shape

```
## Verdict: <APPROVE | APPROVE_WITH_CHANGES | REJECT>

## Role: <first role given>
### F1 [critical|major|minor] confidence=<0.0-1.0>
Evidence: ...
Issue: ...
Change: ...

## Role: <second role given>
None. <one sentence of reasoning>

...
## Suggested changes
## What you would NOT change
```

One verdict for the whole answer, not one per role. The verdict drives the status line, the veto and the skill's first section, and four verdicts per letter would make each of those ambiguous. Findings are numbered from F1 within each section.

`judgeCritique` keeps its rules: no verdict is a failure, a non-approving verdict with no findings is a failure, findings that cite nothing in the plan make the critique blind. It gains one: an answer that lacks a `## Role:` section for one of the four roles is a failure naming the role. A critic that silently skips a role would otherwise look like a critic that found nothing there, which is the loss this change exists to remove. In the evaluation none of the 144 sectioned answers lacked a section.

### D3. Up to five findings per role

The contract today allows three findings for the whole answer and says to prefer one strong finding over several weak ones. The new limit is five per role, with `None.` stated to be a good answer for a role.

The evaluation ran with three per role. Five is the operator's choice, and it follows the literature review, where a hard cap of three cut the key findings found by about half in one study. The counter-argument is the reader's load: four critics at five per role is up to eighty findings. Two things bound that. The measured answers did not fill a limit of three (9.9 to 11.4 findings per answer of a possible twelve), so most sections will not fill five. And the harness reports the share of findings its judges call weak or wrong, so a run at five against the recorded run at three shows whether the looser limit buys findings or noise (tasks, group 5).

The sentence "prefer one strong finding over several weak ones" stays. The limit is a ceiling, not a target.

### D4. Section order

The role sections are given, and must be answered, in an order that is a rotation of the roster `architect, skeptic, pragmatist, verifier`. The rotation for a critic is the first byte of the SHA-256 of the plan's bytes followed by the critic's name, modulo four.

Rotation and not a free shuffle, because four rotations put each role in each position equally often and are easy to state. Derived from the plan and not from `--seed`, because the seed belongs to the letters and a rerun of the same plan should ask the same thing. The measured effect of position is small (85% of a role's own defects found in first position, 81% in last, on the longer plans), so this is cheap insurance against one role always coming last, not a correction of a large bias. The manifest records the order per critique.

### D5. Manifest, files and the letter table

A critique entry loses `role` and gains `role_order` (the four roles as asked) and `findings_by_role` (a count per role). `findings` stays as the total. The raw file is `raw/<critic>.txt`. The table under a printed critique reads letter, critic, model.

Letters are assigned as today. Nothing in a lettered file names its critic: the role headings are the same four in every file, and the order is not a reliable tell because it changes with the plan.

No field keeps the old name for compatibility. The command is the only reader in the package, the skill reads the files and not the manifest's `role`, and a field that always held a constant would mislead.

### D6. The harness

`scripts/eval-second-opinion.mjs`, run by `npm run eval:second-opinion`, following `scripts/eval-retrieval.mjs`: it imports the built library from `dist/`, so it measures the prompt a consumer of the package gets.

- **Fixture.** `test/fixtures/second-opinion-eval/plans/*.md`, each a plan in the skill's shape followed by an answer key: one line per planted defect giving an id, the role it was planted for, the step, and what counts as finding it. The first fixture is the 12 plans of the 2026-11-25 run.
- **Setups.** `shipped` is `critiquePrompt` from `dist/` as it stands. `single-role` is the comparison: one request per critic per role, the contract with one role text. The comparison prompt is assembled by the script from the same templates; it is not a mode of the command.
- **Requests.** Through `askOpenRouter` from `dist/`, so the request carries what a critique's carries: the slug, the prompt, no tool, data collection declined, and no header naming the caller. The key comes from the environment. Slugs come from the shipped table at the tier given.
- **Scoring.** Three judges, the `strong` models of three families, each match every finding to the key or class it valid, weak or wrong. A judge sees the plan, the defects under neutral ids in shuffled order with no role, and the findings under neutral section labels: nothing tells it the setup. A match needs a majority.
- **Report.** Recall of planted defects per critic and for the panel, per setup, with an interval bootstrapped over plans; recall by role; the share of findings filed under the role the defect was planted for; findings per answer and the share judged weak or wrong; recall by section position; output tokens and time; and how often the judges agreed. Written as markdown and JSON to a directory the caller names, outside the repository by default.
- **Recorded run.** `test/fixtures/second-opinion-eval/recorded.json` holds the headline numbers of the last run someone chose to record, with its date, tier, models and the package version. It is information for the next reader, not a gate.

It is not a `ctxr` command, for the reason `eval-retrieval` is not: a store-facing version would ship the fixture into every store. It is not in the test suite and not in CI: it needs a key, costs money (about 46 US dollars of answers for the full run, judging extra) and its numbers vary run to run. The prompt-assembly and scoring functions are plain functions with unit tests against canned answers, so the harness itself cannot rot unnoticed.

### D7. What the skill says

Section 3 states that each reviewer reads the plan alone through four roles and answers in four sections, and gives the measured times. Section 4 changes what the reader does with the letters:

- Group findings by the defect they name, across letters and across roles, before weighing anything. The same defect often appears under different roles in different letters.
- A finding that one letter alone raised is checked against the plan, and the synthesis says whether it holds. Most real defects in a multi-model review are raised by one model, so dropping lone findings loses the most.
- Agreement between letters sets the order to look in. It is not proof: models from different labs share errors.

The sections for evidence-backed dissent, vetoes and the family-bias disclosure stay. The text that names one stance per critic goes, including the sentence about Grok's.

### D8. Polls are untouched

A poll with `--lens` already has each model answer as every lens in one response. This change brings the critique to the same pattern and changes nothing in `pollPrompt`.

## Risks / Trade-offs

- **The evidence is at its ceiling.** → The harness ships with the change, and adding a harder plan is one file. A later run that shows a critic's sectioned answer finding clearly less than its single-role answers is the signal to move to two roles per critic.
- **The plans and the answer key were written by a Claude model**, which is also one critic and one judge. → The headline comparison is within each critic, between setups, so an edge for Claude does not move it. Plans from another author are welcome in the fixture.
- **A critique takes longer and Grok's answer can pass three minutes.** → The limit stays at 600 seconds and the detached run with `result` already exists for chat apps. The skill gives the measured times.
- **More findings to read.** → D3's measurement, and the synthesis order in D7.
- **Five per role is untested.** → Group 5 of the tasks runs the harness at five before release and records it.
- **An answer missing a section fails, losing three good sections.** → It is reported with its cause, the raw file keeps the text, and the quorum of two still stands. Measured rate so far: none in 144 sectioned answers.

## Migration Plan

Ships in a release. A store needs nothing: `ctxr update` refreshes the skill. A machine running an older `ctxr` keeps the pairing until it updates. Rollback is the previous release.

## Open Questions

- Whether the recorded run should also be published in the README, for a reader choosing between this and another tool. Left out for now.
