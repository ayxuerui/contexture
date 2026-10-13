## 1. The explanation skill

- [ ] 1.1 Write `templates/skills/ctxr-explanation.md`: when it applies (and what is out of scope), the rule
      set and the before-and-after example from design.md, the copy-unchanged rule, and what is not adopted
- [ ] 1.2 Add an `EXPLANATION` seed to `src/core/skills.ts` (name, a description with no `": "`, body from
      the template) and add it to `SKILLS`; comment the seed with the change name and why it is named for
      the judgment
- [ ] 1.3 Check the skill against the tier-word guard (none of personal, private, public, shared, internal,
      team, confidential) and the flag-attribution guard

## 2. Routing

- [ ] 2.1 Add the routing line to `templates/conventions/baseline-conventions.md` in its own short section,
      naming `ctxr-explanation` without restating its rules
- [ ] 2.2 Run `npx vitest run test/integration/entry-document-ceiling.test.ts` and confirm the total stays
      at or under 8,500 bytes (7,978 before this change)
- [ ] 2.3 Name `ctxr-explanation` in `templates/skills/ctxr-submit.md` (before step 8),
      `ctxr-publish.md` (step 5, beside the vendored explanation skill, stating sentence shape vs level),
      and `ctxr-research.md` (the step that reports findings)

## 3. Tests

- [ ] 3.1 In `test/unit/skills.test.ts`, add `ctxr-explanation` to the owned-skill list and assert one case
      per scenario of "The explanation skill carries the controlled-English rules"
- [ ] 3.2 Assert the submit skill names `ctxr-explanation` before the first `gh pr create`, and that the
      publish and research skills name it
- [ ] 3.3 Assert the rendered baseline names `ctxr-explanation` and does not contain `20 words`
- [ ] 3.4 Run `npm test` and `npm run typecheck`

## 4. Validate and start the trial

- [ ] 4.1 Run `openspec validate explain-in-controlled-english --strict`
- [ ] 4.2 After release, record the trial's start date in each client store, so the exit review in
      design.md has a fixed comparison point
- [ ] 4.3 Add the D6 authoring rule (controlled step lines with `Why:` reasons, applied when a skill is
      next edited) to `openspec/config.yaml`'s rules, so it binds future skill changes in this repository
