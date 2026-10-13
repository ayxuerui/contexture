## 1. The section

- [ ] 1.1 Append the "Explaining" section from design.md to `templates/conventions/baseline-conventions.md`,
      after "Writing notes"
- [ ] 1.2 Check it against the tier-word guard (none of personal, private, public, shared, internal, team,
      confidential) and confirm it carries no `--flag`
- [ ] 1.3 Set `CONTEXTURE_OWNED_CEILING_BYTES` in `test/integration/entry-document-ceiling.test.ts` to
      `8_900`, with a comment naming this change and design.md D3
- [ ] 1.4 Run `npx vitest run test/integration/entry-document-ceiling.test.ts` and record the measured total
      in the commit message (8,523 bytes on 2026-10-13)

## 2. Tests

- [ ] 2.1 Wherever the baseline's every-turn rules are asserted (`test/unit/agents-doc.test.ts` or the
      conventions test), add one assertion per scenario of "The baseline conventions say how to explain
      something to the operator"
- [ ] 2.2 Assert an updated store's entry document carries the section (extend the existing update test)
- [ ] 2.3 Run `npm test` and `npm run typecheck`

## 3. Validate and start the trial

- [ ] 3.1 Run `openspec validate explain-in-controlled-english --strict`
- [ ] 3.2 After release, note the release version and date in each client store's log, so the trial review
      in design.md has a fixed start
- [ ] 3.3 Add the D7 authoring rule (controlled step lines with `Why:` sentences, applied when a skill is next
      edited) to `openspec/config.yaml`'s rules
