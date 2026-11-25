# Tasks

This change is written on top of the archive of the earlier second-opinion changes (contexture#263). Rebase onto `main` once that has landed, before starting.

## 1. The prompt

- [x] 1.1 Rewrite `templates/second-opinion/critic-contract.md` for one verdict and four `## Role:` sections in the order given, with at most five findings in each role, `None.` and one sentence of reasoning for a role with nothing to report, and the instruction to write a finding once, under the role it falls under (design.md D2, D3).
- [x] 1.2 In the four files under `templates/second-opinion/personas/`, replace the wording that hands the other roles to "the other critics" with wording that hands them to the other sections; change nothing else in them.
- [x] 1.3 In `src/core/second-opinion/prompts.ts`, make `critiquePrompt(critic, plan)` join the contract, the four role texts in that critic's order, and the plan; add `roleOrder(plan, critic)` as the rotation given by the first byte of the SHA-256 of the plan's bytes followed by the critic's name, modulo four (D4).
- [x] 1.4 Unit tests: every order is a rotation of the roster; the same plan and critic give the same order; over the four critics and a set of sample plans each role comes first at least once; the rendered prompt states the limit of five and that `None.` is valid.
- [x] 1.5 Run `npx vitest run test/unit/second-opinion.test.ts && npm run typecheck` and confirm both exit 0.

## 2. Reading an answer

- [x] 2.1 In `src/core/second-opinion/judge.ts`, parse the `## Role:` sections and the findings under each, keep the existing rules for the verdict, findings with no evidence and the veto, and fail a critique that lacks a section for one of the four roles, naming the role.
- [x] 2.2 Unit tests over canned answers: four sections with findings; `APPROVE` with four `None.` sections is valid; three sections is failed naming the fourth; findings that cite nothing in the plan are blind; a `REJECT` with a critical finding that cites the plan is a veto.
- [x] 2.3 Run `npx vitest run test/unit/second-opinion.test.ts` and confirm it exits 0.

## 3. The command

- [x] 3.1 In `src/core/second-opinion/lineup.ts`, replace `ROLE_CLI` with the roster of roles; in `modes.ts`, run one request for each critic in the lineup, and in the manifest drop `role` and add `role_order` and `findings_by_role` (D5).
- [x] 3.2 Name the raw file for the critic alone, attach letters by critic, and make the letter table under a printed critique read letter, critic, model.
- [x] 3.3 Update the descriptions of the second-opinion tools in `src/core/mcp/tools/second-opinion.ts` wherever they describe one role for each critic. None did; the `critique` command's description in `src/run.ts` did and is updated.
- [x] 3.4 Tests of the command against stub tools and a stub endpoint: each request carries the four roles and the plan and nothing from another critic; `--only claude,gpt` still asks for four roles; the manifest's `role_order` matches the request; an answer missing a section is failed and the run is partial when fewer than two remain; the lettered files hold no critic or model name.
- [x] 3.5 Run `npm run build && npx vitest run test/unit/second-opinion.test.ts test/unit/second-opinion-openrouter.test.ts test/unit/second-opinion-serve.test.ts test/unit/mcp-second-opinion.test.ts` and confirm it exits 0.

## 4. The skill

- [x] 4.1 In `templates/skills/ctxr-second-opinion.md`, rewrite the paragraph in section 3 that gives each reviewer a stance of its own: each reviewer reads the plan alone, in four roles, and answers in four sections. Replace the measured times with those of design.md's Impact. Follow the controlled-English rule for the steps touched, and keep each `Why:` sentence.
- [x] 4.2 Rewrite the start of section 4's list: group findings by defect across letters and roles; check a finding one letter alone raised against the plan and say whether it holds; agreement sets the order to look in and is not proof (D7). Keep the sections for dissent, vetoes and the family bias.
- [x] 4.3 Remove the text that pairs a role with a critic, including the sentence on Grok's stance, and check the rendered skill for the seven words the skill tests ban and for any option `src/run.ts` does not register.
- [x] 4.4 Extend the rendered-skill test for the four statements of the new skill requirement and for no role paired with a critic; update the plugin copies with `npm run plugin`.
- [x] 4.5 Run `npx vitest run test/unit/skills.test.ts test/unit/plugin-committed.test.ts` and confirm it exits 0.

## 5. The harness

- [x] 5.1 Add the 12 seeded plans with their answer keys under `test/fixtures/second-opinion-eval/plans/`, one file each, the plan in the skill's shape followed by the key (D6).
- [x] 5.2 Add `scripts/eval-second-opinion.mjs` with `run`, `judge` and `report` steps: prompts from `dist/` for the shipped setup and assembled from the same templates for the single-role setup; requests through `askOpenRouter` from `dist/`; three judges with neutral ids and labels; the report of D6. Answers and judgements are kept on disk so an interrupted run resumes.
- [x] 5.3 Put prompt assembly, answer parsing and scoring in functions the script exports, and add `test/unit/second-opinion-eval.test.ts` over recorded answers and judgements for one plan: the shipped-setup prompt equals `critiquePrompt`; the judge prompt names no role and no setup; scoring gives the stated recall for each critic and for the critics together.
- [x] 5.4 Add `"eval:second-opinion": "npm run build --silent && node scripts/eval-second-opinion.mjs"` to `package.json` and a short section in `CONTRIBUTING.md`, where the development notes are, on when to run it and what it costs.
- [x] 5.5 Run `npx vitest run test/unit/second-opinion-eval.test.ts && npm test` with no OpenRouter key set and confirm both exit 0.
- [x] 5.6 With a key, run the harness for the shipped setup at three repetitions (`run`, `judge`, `report`, each with `--setups shipped --reps 3`) and confirm the report exits 0. Done 2026-11-25: all critics together found 100% of 112 planted defects; 11.9 findings per answer against 10.4 at three per role; 2.4% judged weak or wrong against 1.3%. Recorded in `test/fixtures/second-opinion-eval/recorded.json`. The single-role comparison was left out of this run: a first attempt at both setups stopped at the OpenRouter key's monthly limit, and the question here was the looser limit, not the comparison.

## 6. Whole change

- [x] 6.1 Update the README's second-opinion section where it describes one role for each critic.
- [x] 6.2 Run `openspec validate review-a-plan-in-every-role && npm run typecheck && npm test` and confirm all three exit 0.
