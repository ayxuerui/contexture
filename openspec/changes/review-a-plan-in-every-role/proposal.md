# Proposal

## Why

A critique gives each model family one role: Claude reviews structure, GPT failure modes, Gemini simplicity, Grok verification. So each role gets one model's read, and a run with fewer critics loses roles outright: a machine with no OpenRouter key has no verifier, and `--only claude,gpt` reviews neither simplicity nor verification.

An evaluation on 2026-11-25 measured the alternatives on 12 plans with 112 planted defects, four families at the `strong` tier, three repetitions, scored by three judges that saw neither the setup nor the role a defect was planted for:

| | Plans of 7 to 11 steps | Plans of 12 to 22 steps |
|---|---|---|
| Today's pairing, four requests | 98.4% | 89.6% |
| Mean of all 24 pairings | 98.0% | 93.5% |
| Every critic in every role, one answer each, four requests | 100% | 100% |
| Every critic asked once per role, sixteen requests | 100% | 100% |

On the longer plans today's pairing was the worst of the 24. Asking each critic once per role gained nothing over one answer in four sections: a single-role answer filed only about half of its findings under its own role, so the four answers repeated each other. One sectioned answer used about half the output of the four separate ones.

The evaluation is at its ceiling: nearly every critic found nearly every planted defect in both setups. It shows the fixed pairing loses defects and the sixteen-request grid is not needed on these plans. It does not show how the setups compare on defects subtler than the ones planted, which is why the harness that produced it should stay.

## What Changes

- **BREAKING** A critique sends every critic the four roles' instructions and asks for one answer with a section for each role. No role belongs to a model family any more.
- The order of the four role sections differs from critic to critic. It is derived from the plan and the critic's name, so a rerun of the same plan gives the same order, and the manifest records it.
- A critic may give up to five findings in each role's section, and `None.` is a valid section. Today's limit is three findings for the whole answer.
- An answer that lacks a role's section is a failed critique, naming the role.
- **BREAKING** A critique in the manifest has no `role`. It gains the order of its sections and the number of findings in each. The raw file is named for the critic alone, and the letter table attaches each letter to its critic and model.
- The skill tells the agent to group findings by the defect they name across the letters, to check a finding that only one critic raised against the plan and say whether it holds, and to treat agreement between critics as a reason to look first, not as proof.
- The repository gains an evaluation harness: seeded plans with an answer key, a script that runs the shipped critique prompt and a comparison setup against the four families, three judges, and a report. It is run by hand when a shipped model or the critique prompt changes. It is not part of the test suite.

Nothing changes for polls, routes, the lineup, the quorum of two, anonymized letters, the blind check, or the rule that critics never see each other.

## Non-goals

- **A way to get the old pairing back.** No option and no configuration key selects one role per critic. The change is reversible by release, and a second mode would double what the skill has to explain and what the harness has to measure.
- **Asking each critic once per role.** The sixteen-request grid found nothing the sectioned answer missed and repeated itself more. It exists only as the harness's comparison setup.
- **A second round, or critics reading each other.** Unchanged, for the reason the skill already gives: reviewers who read each other converge.
- **Choosing roles per run.** A critique always covers the four roles. A store that wants other lenses on a taste question has the poll's `--lens`.
- **Gating a release on the harness.** Its answers vary from run to run and cost money, so a fixed threshold would fail by chance. It reports; a person decides.
- **Making the seeded plans hard enough to separate the setups.** The first fixture is the 12 plans already measured. Harder plans are worth adding and can be, one file each, without another change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: the second-opinion requirements that give each critic one role, name Grok's role, and describe what the skill says about the critics; new requirements for the four-role answer, the section order, the findings limit, the synthesis guidance, and the evaluation harness.
- `cli-contract`: the letter table that `--print` and `result` write attaches a letter to a critic, not a role.

## Impact

- Code: `src/core/second-opinion/prompts.ts`, `judge.ts`, `modes.ts`, `lineup.ts`; the MCP tool descriptions in `src/core/mcp/tools/second-opinion.ts`, which mirror the command.
- Templates: `templates/second-opinion/critic-contract.md`, the four files under `templates/second-opinion/personas/`, and `templates/skills/ctxr-second-opinion.md`.
- New: `scripts/eval-second-opinion.mjs`, `test/fixtures/second-opinion-eval/`, and an `eval:second-opinion` script in `package.json`.
- Readers of `manifest.json` or the `--json` envelope that use `role` break. No shipped code reads it outside the command.
- A critique takes longer: one sectioned answer measured 55 to 65 seconds for Claude, about 105 for Gemini and 190 to 210 for Grok through OpenRouter, against roughly half that for one role. The default limit of 600 seconds per critic stays.
- This change is written on top of the archive of the earlier second-opinion changes (contexture#263) and modifies requirements that archive adds to the main specs.
