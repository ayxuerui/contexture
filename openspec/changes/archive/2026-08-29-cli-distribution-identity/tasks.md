## 1. Package and entry point

- [x] 1.1 `package.json`: `name` → `ctxr`; `bin` → `ctxr` (primary) and `contexture` (compatibility alias), both `./dist/bin.js`; `README.md`: title "Contexture (`ctxr`)", install (`npm i -g ctxr`) and usage, alias noted once
- [x] 1.2 `src/run.ts`: commander program name `ctxr`
- [x] 1.3 Verify: `npm run build && node dist/bin.js --help 2>&1 | head -1` prints `Usage: ctxr …`; `npm pack --dry-run --json` reports name `ctxr` and both executables

## 2. Shipped and generated surfaces

- [x] 2.1 Every instruction to run a command names `ctxr`: `src/core/agents-doc.ts` (generated sections), `src/core/procedures.ts` (shipped seeds), `src/adapters/harness/claude-code.ts` (skill wrapper header), `src/core/errors.ts` + `src/core/checks/*.ts` (error/check messages), `src/core/root.ts` comment
- [x] 2.2 `templates/hooks/*.sh`: comments and `re-run …` hints name `ctxr`; diagnostic prefix `contexture:` → `ctxr:`; `__CONTEXTURE_BIN__` / `CONTEXTURE_BIN` / `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH` unchanged
- [x] 2.3 Verify: `grep -rnE "contexture (init|doctor|check|adapters|archive|catalog|graph|ingest|lint|migrate|note|rollup|session|source|verify|search)\b" src templates README.md` exits 1 (no matches)

## 3. Tests and project context

- [x] 3.1 Update assertions that match invocation text (`no \`ctxr search\` command`); add coverage for the cli-contract scenarios: `--help` usage line names `ctxr`; a fresh store's `AGENTS.md`, procedure seeds, hooks, and skill wrapper contain no `contexture <subcommand>`; a hook written with the old text is reported stale by the hook-health check and rewritten
- [x] 3.2 `openspec/config.yaml` project context: record the split (executable and npm package `ctxr`; `contexture` for the product and everything store-resident or environmental; `contexture <command>` in specs denotes the executable)
- [x] 3.3 Verify: `npm run build && npm run typecheck && npx vitest run` all green; `openspec validate cli-distribution-identity` passes
