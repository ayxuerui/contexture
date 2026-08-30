## 1. Package name

- [x] 1.1 `package.json` + lockfile `name` → `ctxr-cli`; README install line; manifest unit test; `openspec/config.yaml` project context
- [x] 1.2 Verify: `npm pkg get name` prints `"ctxr-cli"`; `npm run build && npm run typecheck && npx vitest run` green

## 2. Spec

- [x] 2.1 Sync the modified cli-contract requirement into `openspec/specs/cli-contract/spec.md`; `openspec validate --specs` passes

## 3. Publish (operator, interactive terminal — passkey 2FA)

- [x] 3.1 `npm publish` from the repo; `npm view ctxr-cli version` prints `0.1.0` and `npx ctxr-cli --help` prints `Usage: ctxr`
