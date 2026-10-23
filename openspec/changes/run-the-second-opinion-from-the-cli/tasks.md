## 1. The command

- [x] 1.1 Move prompts to `templates/second-opinion/`; port the runner to `src/core/second-opinion/` with the D2 exit codes and the D3 environment allowlist
- [x] 1.2 Register `ctxr second-opinion preflight|critique|poll` with `--json`; port every stub-CLI scenario of `run.mjs` to `test/unit/second-opinion.test.ts` against the command's subcommands and exit codes, plus the environment tests (including a protected variable named in the pass-through list)
- [x] 1.3 `npx vitest run test/unit/second-opinion.test.ts` passes

## 2. Skill and context

- [x] 2.1 Remove the supporting-file entries for `ctxr-second-opinion` in `src/core/skills.ts`; reword `templates/skills/ctxr-second-opinion.md` around the command; delete `templates/skills/ctxr-second-opinion/`
- [x] 2.2 Add the one-exception sentence to `openspec/config.yaml`'s context
- [x] 2.3 `npx vitest run test/unit/skills.test.ts test/integration/owned-skills.test.ts` passes, including the update that removes `run.mjs`

## 3. Whole suite

- [x] 3.1 `npm run build && npm test && npm run typecheck` exit 0
- [x] 3.2 `node dist/bin.js second-opinion preflight` on this host reports OK for claude, codex and agy
