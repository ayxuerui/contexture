## Context

See proposal.md for the motivation. The current state:

- `ctxr land --pending` is complete and resumable. Every step re-reads the forge and git state, pushes are leased,
  and merges are confirmed by reading back.
- `ctxr serve` keeps a serving state that follows `contexture.yaml` (`serve-follows-config-changes`). The approval
  surface is built from it, and decisions go through `decide()` in `src/core/browse/approve.ts`.
- `approve-from-the-review-page` D7 rejected having `serve` spawn the lander. Its reasons were: `serve` would need
  write access to the store and merge credentials, and scheduling belongs to the deployment. This change reverses
  D7, and D1 below weighs both again.

## Goals / Non-Goals

**Goals:** an Approve click on any `ctxr serve` lands the change within seconds, with no scheduler; nothing about
landing can slow or break browsing; two landers never fight.

**Non-Goals:** see proposal.md.

## Decisions

### D1. `serve` lands, reversing approve-from-the-review-page D7

D7's reasons, weighed again:
- **Merge credentials.** `serve` has held the App key since `github-app-recording-identity`, and that key can
  merge. Landing adds no credential.
- **Writing the store.** This is new: the store becomes writable for `serve`. It is the cost of a lander that
  needs no scheduler. Within `serve`, only the child process writes. Route handlers still write nothing
  (context-browsing).
- **Scheduling belongs to the deployment.** That holds only for deployments that have a scheduler, and the plain
  `ctxr serve` user has none. That is the failure this change exists for.

The alternative was to keep `land-cron` and document `ctxr land --pending` for everyone else. That is less code,
but it leaves the Approve button inert by default, and that is the defect.

### D2. A child process, never in-process

`serve` spawns its own executable (`process.execPath` with the CLI entry script) with
`land --pending --root <root>`, so the lander is exactly the command a person would run. It reads the
configuration fresh, takes the lock, and contains a hang, a crash or a resolver that runs for minutes. stdout and
stderr are piped to `serve`'s stderr, each line prefixed `land: `.

### D3. Triggers, coalescing and the sweep

A small state machine: `idle`, `running`, or `running + pending`.
- A trigger while `idle` starts a run.
- A trigger while running sets `pending`. Ending with `pending` set starts one more run.
- The sweep is a timer that fires a trigger every 300 s. It also fires once 10 s after startup, so approvals
  made while `serve` was down land promptly.

The Approve trigger fires after the review was posted, and is not awaited, so the decider's redirect never
waits on a landing run.

### D4. The lock lives in git's common directory

`ctxr land` writes `<git-common-dir>/ctxr-land.lock` with `O_EXCL`, containing its pid and host name, and
removes it on exit, including when it is stopped by `SIGTERM` or `SIGINT`. A lock whose pid no longer exists on the
same host is stale and is taken over. Only the host that wrote a lock can tell whether its process is alive, and
each container has its own host name, so a lock written by another host counts as stale once it is two hours
old. That is longer than any landing run, and it covers a container that was recreated while holding the lock. The common
directory is shared by all worktrees and by every container that mounts the store, so `serve`, a person in the
`agents` container, and a leftover `land-cron` all see one lock.

*Alternative: `flock` on a file descriptor.* Rejected: Node has no portable `flock`, and an `O_EXCL` pid file is
what git itself does for `index.lock`.

### D5. `serve` stays out of the agents container (the operator's suggestion, weighed)

*The case for running `serve` inside `agents`:* one container fewer; `serve` would naturally have write access to
the store as the agents' uid, the git identity, and s6 supervision.

*Why not:* landing needs the App key, so the key would be inside the container where agents run shell commands.
One App serves every store the operator runs, so an agent able to read the key could push and merge in all of
them. Hiding the key from the agents' uid inside the same container means a second uid. But landing must write
`/store` as the agents' uid, or the files it leaves become uneditable by the agents. One container cannot give
the agents' uid the store while denying it the key without a privilege-separated helper. A separate `serve`
container from the same image, running as the same uid with the store writable, gets both properties from the
container boundary. The deployment keeps one image, and there is still one `serve` per store.

*The broker variant, weighed (the operator raised it).* A token broker holding the App key would hand the
co-located `serve` a credential that mints tokens for its own store's repository only. That limits a leak to one
store. It does not solve the deeper problem. An agent that reads that credential can post an approving review as
the recording identity on its own pull request, with a marker naming any email address. `ctxr land` would then
land it, attributed to a person who never saw it. The approval record means something only while the agents cannot
use the recording identity at all, for any repository. A broker narrows which repositories a token reaches, not who
can use it inside one. The broker stays reserved for its own purpose: one App shared by owners the maintainer does
not run (`github-app-recording-identity` D3).

*Separate hardening, outside this change.* In pkm the agents' own forge login is the repository owner, and GitHub
Free gives private personal repositories no branch protection, so an agent could merge directly without any
approval. That is a bypass, and visible as one, where a forged approval is a false record. It is fixed by giving
agents a login that can open pull requests but not merge, or by branch protection, and it is worth doing only once
the recording identity is out of agents' reach, which this decision keeps.

### D6. Committer identity on a bare host

When no committer is configured, `ctxr land` sets `GIT_COMMITTER_NAME` to the recording login. "Configured" means
`user.email` in the checkout's git configuration, or `GIT_COMMITTER_EMAIL` or `EMAIL` in the environment. `git var`
does not decide this, because git guesses an identity from the host name (`ubuntu@<fqdn>` on the maintainer's
host) rather than failing, and that guess names an account that does not exist. `ctxr land` likewise sets and `GIT_COMMITTER_EMAIL` to `<recording login without [bot]>@users.noreply.github.com`, in the rebase process's environment only. A resolver also gets the same author variables, since it makes new commits. The author of each commit is untouched, so the change stays attributed to whoever
wrote it.

## Risks / Trade-offs

- [`serve` can now write the store] → Only the child process does, and only through `ctxr land`, which is the
  same code path a person runs. The decision route still writes nothing under the store root.
- [A landing run competes with requests for `serve`'s one CPU] → Runs are sequential and mostly waiting on the
  forge. A resolver is the heavy case, and it is opt-in.
- [A resolver started by `serve` runs with `serve`'s environment, which includes the key] → This holds for any
  resolver run by any lander. The resolver is a command the operator chose. The docs say so.

## Migration Plan

Released in the next ctxr release. Stores on contexture-images: the follow-up removes `land-cron`. Until it
merges, `land-cron` and `serve` share the lock and never race. pkm's `.env` can then drop
`COMPOSE_PROFILES=approvals`. Rollback: `change_approval.land: manual` stops landing without a release.
