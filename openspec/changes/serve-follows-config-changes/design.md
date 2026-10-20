## Context

See proposal.md for the motivation. The facts that shape the approach:

- `ctxr serve` builds `{ root, config }` once in `openStore` and passes it to every request. The approval server
  (forge client, credential, identity verifier) is built once in `approvalServer()`, and a failed build stops the
  command.
- In the deployments, the served checkout is a Docker volume. `serve` mounts it read-only, and another container
  (`agents` with the store-update service, or `land-cron`) moves it forward with `git merge --ff-only`. git writes
  the new `contexture.yaml` to a temporary file and renames it into place.
- Every route already rebuilds its route table per request (local-browsing-surface D2), so a request already pays
  for reading the store. One `stat` is negligible beside that.

## Goals / Non-Goals

**Goals:** a configuration change takes effect on the next request; a bad change never takes browsing down; the
approval surface is built, rebuilt or dropped to match.

**Non-Goals:** see proposal.md.

## Decisions

### D1. `stat` per request, not a file watcher

Before each request, `stat` the file and compare modification time, size, device and inode with the last read.

*The case for `fs.watch`:* no work per request, and the change is seen at once instead of on the next request.
*Why not:* the file is replaced by a rename, so a watch on the old inode goes silent. A watch on the directory
works on a local filesystem, but its behaviour across Docker volumes, rootless overlay and bind mounts varies by
kernel and storage driver. A watcher that silently stops reproduces exactly the failure this change fixes, and
nobody would notice. A `stat` fails visibly when it fails. Comparing the inode also catches a rename that kept the
size and the second-resolution time.

### D2. One holder of the current configuration and approval surface

The command builds a `ServingState { store, approval, approvalError }` at startup and keeps it in a holder.
`current()` stats the file and reloads when it changed. Each request takes its state once at the start, so a
single request never mixes two configurations. Reloads are serialized, so concurrent requests share one read.

### D3. When the approval surface is rebuilt

A rebuild resolves the credential and checks the login, which is a forge call, so it happens only when its inputs
change. The inputs are the `change_approval` block and `serve.base_url`, compared as canonical JSON. A change to an
unrelated key, such as the taxonomy, swaps the configuration and keeps the existing approval surface, including
its cached installation token and identity key set.

### D4. A failed approval build after startup answers 503 and retries

At startup the existing fail-fast stays. After startup, a failure becomes `approvalError`. Every `/approve/` route
then answers `503` with the error's message. Retries happen on requests, at most every 30 s, so a forge outage
cannot turn every request into a forge call.

*The case for exiting and letting Docker restart the container:* simple, and it reuses the startup check. *Why
not:* `restart: unless-stopped` would turn one bad commit into a restart loop that also takes down notes, catalog
and published pages, none of which depend on the forge.

### D5. A configuration that fails to load keeps the last good one

The read routes keep the last good configuration. `serve` writes one stderr line per distinct failure, so a broken
file does not log on every request. Being explicit about the failure meets the fail-loud contract: nothing is
guessed, the server says what it is doing, and it serves only what it last validated. The failure is not put in
page bodies, because the read routes have no requester concept and the message is operator detail.

## Risks / Trade-offs

- [A request lands between git's rename and the new content being complete] → git renames a complete temporary
  file, so a reader sees the old file or the new one, never part of one. A read that still fails is treated as a
  load failure and retried on the next change of the file's identity.
- [Rebuilding the approval surface drops cached tokens and the key set] → It happens only when the approval block
  or base URL changes (D3).
- [A server that silently runs an old configuration after a bad change] → The stderr line, and the approval
  routes' `503` when the approval part is what failed. The read routes' content matches the last good commit.

## Migration Plan

No migration. Released in the next ctxr release. The manual `docker compose restart serve` after a configuration
change stops being necessary.
