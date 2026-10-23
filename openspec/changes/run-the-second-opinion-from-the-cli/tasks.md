## 1. Port the tests first

- [ ] 1.1 Port the stub-CLI tests of `run.mjs` to vitest, parameterised over the runner entry point; `npx vitest run test/unit/second-opinion.test.ts` passes against `run.mjs`

## 2. The command

- [ ] 2.1 Move prompts to `templates/second-opinion/`; port the runner to `src/core/second-opinion/` with the D2 exit codes and the D3 environment allowlist
- [ ] 2.2 Register `ctxr second-opinion preflight|critique|poll` with `--json`; add the environment and exit-code tests
- [ ] 2.3 `npx vitest run test/unit/second-opinion.test.ts` passes against the command (and, before deletion, against `run.mjs` for every shared scenario)

## 3. Skill and context

- [ ] 3.1 Reword `templates/skills/ctxr-second-opinion.md` around the command; drop the skill's supporting files; delete `templates/skills/ctxr-second-opinion/`
- [ ] 3.2 Add the one-exception sentence to `openspec/config.yaml`'s context
- [ ] 3.3 `npx vitest run test/unit/skills.test.ts test/integration/update.test.ts` passes, including the update that removes `run.mjs`

## 4. Whole suite

- [ ] 4.1 `npm run build && npm test && npm run lint` exit 0
- [ ] 4.2 `node dist/bin.js second-opinion preflight` on this host reports OK for claude, codex and agy
