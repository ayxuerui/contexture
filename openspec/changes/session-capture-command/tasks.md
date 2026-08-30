## 1. Configuration and identity model

- [ ] 1.1 Add `identity.files` (role → path, defaulting to `<identity.path>/<canonical>`), `identity.entry_delimiter` (default empty line), `write_lifecycle.writable_paths` (default `[]`) to schema, defaults, renderer, init; migrate test fixtures
- [ ] 1.2 `identityFilePath(config, role)`; every identity consumer (ensure, exclusion check, injection adapters, entry-doc section) uses it
- [ ] 1.3 Entry model in `src/core/identity.ts`: parse/serialize entries by delimiter; `ctxr identity add|replace|remove --file <role> [--text] [--match]`
- [ ] 1.4 Tests: default paths equal today's; a role pointed outside `identity.path` is ensured there and the exclusion check inspects that path; add/replace/remove on a blank-line file and on a custom-delimiter file; zero or multiple matches refuse with a distinct error; `npx vitest run test/unit/identity.test.ts test/unit/identity-command.test.ts`

## 2. Path gate (write-lifecycle first)

- [ ] 2.1 One `sanctionedPath(config, root, path)` function: canonical path inside root, no escaping symlink; when `writable_paths` is declared, under a layer, the inbox, a writable path, or a contexture-owned location
- [ ] 2.2 `staged.path_allowlist` applies it to staged markdown files; `doctor --staged` fails on a violation
- [ ] 2.3 Tests: symlink escape refused with and without `writable_paths`; undeclared `writable_paths` accepts any in-store path; declared list refuses a path outside it and accepts a layer, the inbox, an identity file; `npx vitest run test/unit/write-lifecycle-checks.test.ts`

## 3. Capture command

- [ ] 3.1 `ctxr session capture --proposal <file>` per D1/D2: notes (create or append, visibility field written when given), identity deltas via the entry primitive, per-item refusal, JSON and human report from actual writes
- [ ] 3.2 Tests: a proposal with one bad path writes the others and exits non-zero naming the refused item; append preserves prior content byte-for-byte; visibility field lands under the configured key and `note resolve` reports `explicit`; identity deltas land in the resolved files; a second run of an `add`-only proposal appends again (the command is not idempotent by design — the proposal is); `npx vitest run test/unit/session-capture.test.ts`

## 4. Skill and contract

- [ ] 4.1 `ctxr-session-capture` Apply step drives the command; identity paths rendered from `identity.files`; `openspec/specs/cli-contract` updated
- [ ] 4.2 `npm run build && npm run typecheck && npx vitest run` green; on a temp store, `ctxr session capture --proposal <file> --json` reports `wrote` and `refused` as specified
