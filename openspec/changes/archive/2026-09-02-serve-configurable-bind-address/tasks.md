Implemented ahead of this document, at the requester's explicit direction (a live deployment was
blocked on it) — tasks recorded here to match what shipped, then verified for real before archiving.

## 1. Implementation

- [x] 1.1 `src/commands/serve.ts`: export `DEFAULT_HOST`; `ServeFlags` and `ServeData` gain `host:
      string`; `execute()` binds `server.listen(flags.port, host, ...)` and builds the reported `url`
      from `host` instead of the hardcoded constant; the inbound-request URL parse base is decoupled
      from the bind address (it was only ever a placeholder for relative-path parsing).
- [x] 1.2 `src/run.ts`: add `--host <address>` to the `serve` command, defaulting to
      `serveCommand.DEFAULT_HOST` (no duplicated literal), passed through to `execute()`.
- [x] 1.3 `test/integration/serve-command.test.ts`: new case — `--host 0.0.0.0` is reported and bound
      correctly (verified by connecting over `127.0.0.1`, which `0.0.0.0` also accepts).
- [x] 1.4 Verify: `npm run typecheck && npm run build && npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'` — 3/3 passing.

## 2. Full verification

- [x] 2.1 `npx vitest run test/unit --exclude '**/.claude/**'` — 74 files / 715 tests passing.
- [x] 2.2 `npx vitest run test/integration --exclude '**/.claude/**'` — 23 files / 81 tests passing.
- [x] 2.3 `openspec validate serve-configurable-bind-address --strict` and `openspec validate --specs`
      both clean.
