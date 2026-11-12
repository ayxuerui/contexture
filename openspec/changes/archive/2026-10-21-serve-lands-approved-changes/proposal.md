## Why

The approval page promises that an approved change "lands without further steps". Today nothing in contexture
keeps that promise. Landing happens only when something runs `ctxr land --pending`, and the only thing that does
is `land-cron`, a scheduled container in contexture-images. A store that runs plain `ctxr serve` (from the CLI,
from systemd, or from any deployment other than those images) gets an Approve button that records a decision,
after which nothing lands. Even with `land-cron`, an approval waits up to five minutes for the next slot. The
button and the thing that acts on it belong in the same program.

## What Changes

- **`ctxr serve` lands approved changes itself** whenever the configuration it has loaded declares
  `change_approval`. It runs `ctxr land --pending` as a child process:
  - right after it accepts an Approve decision, so the change lands in seconds;
  - every five minutes as a sweep, to catch approvals recorded while it was down, merges the forge refused
    for now, and carry-overs.

  Runs never overlap. A trigger that arrives during a run starts one more run when that run ends.
- **Opt-out:** `change_approval.land: manual` turns this off, for a deployment that lands some other way.
  Absent means automatic.
- **One lander per repository.** `ctxr land` takes a lock in the repository's git directory. A second
  concurrent run, from another server or a person, skips with a notice rather than racing.
- **Landing works on a host with no git identity.** When git has no committer configured, the rebase commits
  as the recording identity. So `serve` in a bare container needs nothing but the App credential.
- **Output:** a run's output goes to `serve`'s stderr, prefixed. A failed or blocked run never affects a
  request. The approval page already shows a blocked or needs-re-approval state to the decider.
- **Stopping `serve`** stops a run in progress. Landing is resumable, because every step re-reads state, so
  the next start finishes it.

## Non-goals

- **Running landing inside the request path.** A resolver can run for minutes. A child process keeps a crash,
  a hang or memory growth away from browsing.
- **Removing `ctxr land`.** It stays the command for people who land by hand or from their own scheduler.
- **Serving from the agents container.** The deployment keeps `serve` in its own container (same image), because
  that container holds the App key, and agents must not be able to read it. design.md D5 gives the case.
- **Notifications.** A blocked landing is visible on the approval page and in `serve`'s log. Chat or email
  notification is separate work.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `change-approval`: adds that the server lands approved changes, after a decision and on a periodic sweep, as a
  child process that never overlaps itself, with `land: manual` to opt out.
- `write-lifecycle`: adds a per-repository landing lock, and a committer identity for landing on a host with
  none.

## Impact

- `src/commands/serve.ts`: a lander that is started, rescheduled and stopped with the serving state from
  `serve-follows-config-changes`, so turning approval on or off at runtime starts or stops it. Triggered from the
  decision route after an accepted approval.
- `src/commands/land.ts`: the lock, and the fallback committer identity.
- `src/config/schema.ts`: `change_approval.land: 'auto' | 'manual'`, optional, absent meaning `auto`.
- Docs: the README's approval section no longer needs a scheduler.
- contexture-images (follow-up): remove `land-cron` and the `approvals` profile; mount the store writable in
  `serve`; give `serve` HOME for a git identity if the deployment has one. The `serve` container keeps the key,
  and `agents` still never gets it.
