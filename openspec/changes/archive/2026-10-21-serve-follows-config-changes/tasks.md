## 1. The configuration holder

- [x] 1.1 Add the serving-state holder to `src/commands/serve.ts` (or `src/core/browse/serving-state.ts`): stat the configuration file (mtime, size, dev, ino), reload through `readConfig` on a change, serialize reloads, keep the last good configuration and record one stderr line per distinct load failure (D1, D2, D5)
- [x] 1.2 Rebuild the approval surface only when `change_approval` or `serve.base_url` changes (canonical JSON comparison); after startup a failed build becomes `approvalError`, retried on request at most every 30 s (D3, D4); startup keeps failing fast
- [x] 1.3 Route every request through one state taken at its start; approval routes answer `503` with `approvalError`'s message when set, `404`/`405` when the block is absent
- [x] 1.4 Unit tests for the holder with an injected clock and a temporary file: unchanged file not re-read, change reloaded, rename with equal size and time detected by inode, failed load keeps the last good config and logs once per failure, retry interval respected
- [x] 1.5 `npm test -- serving-state` passes

## 2. Integration

- [x] 2.1 Integration test against a running `ctxr serve` (fake forge, real signatures): add `change_approval` → `/approve/` answers `200`; add a decider → admitted; set a mismatched `recording_login` → `/approve/` `503` naming both logins while `/notes/...` stays `200`; fix it → `200`; remove the block → `404` and decision `POST` `405`; replace the file with invalid YAML → read routes unchanged and one stderr line
- [x] 2.2 `npm run build && npm test && openspec validate serve-follows-config-changes --strict` all exit 0
