## Why

`ctxr serve` reads `contexture.yaml` once, when it starts. The served checkout changes under it while it runs:
the store-update service fast-forwards it, and so does `ctxr land` after each merge. So a configuration change
that lands while `serve` is up is ignored until someone restarts the container. On 2026-10-20 this happened on
pkm's first rollout of change approval. `serve` started before the store update pulled the commit that declared
`change_approval`, so `/approve/` answered `404` until a manual restart. Every later edit has the same problem:
adding a decider, rotating the Access audience, or changing `serve.base_url`. Nothing tells the operator that
the running server is out of date.

## What Changes

- `ctxr serve` checks `contexture.yaml` before every request, using its modification time, size and file
  identity. When the file has changed, `serve` reads and validates it again and uses the result from that request
  on. One check costs one `stat`.
- The approval surface follows the configuration. When `change_approval` appears, `serve` builds it, including
  the credential and the recording-login check. When the block changes, `serve` rebuilds it. When the block goes
  away, `serve` drops it, and `/approve/` answers `404` again.
- A bad change does not take browsing down. Bad means a configuration that does not load, or an approval
  surface whose credential or recording login fails its check after startup. In both cases `serve` keeps the last
  configuration that loaded for the read routes. The approval routes answer `503`, naming the problem without any
  secret. `serve` reports the problem once on stderr. It keeps checking, and a later fix takes effect without a
  restart.
- Startup is unchanged. A configuration that does not load, or a recording login that does not match, still stops
  `ctxr serve` before it binds.

## Non-goals

- **Reloading anything other than `contexture.yaml`.** Environment variables, such as the GitHub App credential,
  are fixed when the process starts, as for any process. Changing them needs a restart, which the container
  manager already does when they change.
- **Reloading in other commands.** Every other command reads its configuration once and exits.
  `ctxr land --pending` is a new process on every scheduled run, so it already follows changes.
- **Watching the file with `fs.watch` or inotify.** Design D1 gives the reasons.
- **Changing what any route shows.** A route answers exactly as it would after a restart with the same file.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `context-browsing`: adds that the server follows changes to the store's configuration while it runs, and keeps
  serving the last configuration that loaded when a change does not load.
- `change-approval`: adds that the approval routes follow the configuration the server last loaded. A change that
  turns approval on, changes it or turns it off takes effect without a restart. An approval configuration that
  fails its checks after startup makes the approval routes answer `503`, not stop the server.

## Impact

- `src/commands/serve.ts`: a configuration holder consulted at the top of every request. The approval server is
  built from it, and rebuilt when the `change_approval` block or `serve.base_url` changes.
- `src/config/load.ts`: unchanged. The holder calls `readConfig` again.
- Tests: an integration test that edits `contexture.yaml` under a running `serve`, adding, changing, breaking and
  removing `change_approval`.
- contexture-images: no change. The manual restart after a first rollout is no longer needed.
