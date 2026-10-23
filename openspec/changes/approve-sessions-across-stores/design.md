## Context

See proposal.md for why. What the approach builds on:

- **Approval today is per store and per pull request.** `/approve/` lists the store's session worktrees that have
  an open pull request. A decision is a review by the recording login, with a marker naming the decision, the head
  and the decider (`src/core/approval/decision.ts`). Only that login's reviews count. An approval carries across a
  catch-up rebase only when the patches are unchanged. `serve` runs `ctxr land --pending` after an approval and
  every five minutes.
- **The forge is the only record.** No file, queue or database holds decisions. This design keeps it that way.
- **`mount-shared-stores`** gives a store a list of mounted stores, each a full store with its own configuration
  and its own `serve`, cloned under `shared/<name>/` in the main working tree. A write to a mount is a session
  started inside it. The pull request opens on the mount's repository, and the mount's own `serve` lands it.
- **One GitHub App per party.** The operator's App is the recording identity for every store they run, so it can
  read and review pull requests on the home store and on every mount.
- **`serve` mounts the store read-only** (`serve-lands-approved-changes` D5: the App key never reaches the agents'
  container).

## Goals / Non-Goals

**Goals:**
- One decision per piece of work, in the place the person already approves things.
- A landing order that leaves a safe state when it stops partway.
- No new state outside the forge, and no new configuration key.
- Every store keeps control of its own changes: its deciders, its landing, its credential boundary.

**Non-Goals:** see the proposal's Non-goals.

## Decisions

### D1. The session is the unit, and it has one home

A session starts in one store, its home. Writing into a mount starts a joined session there. The session's
identity is the home repository plus the home branch.

**Case for grouping pull requests some other way:** by a label the agent chooses, or by time window, with no new
command. **Why not:** a label is free text, and two sessions can choose the same one. A time window groups by
accident. The session already exists as the unit people approve, and the approval page already lists sessions.
This only lets one session reach further.

### D2. A joined session takes the home branch name, and every pull request carries a marker

The shared branch name makes the parts recognizable in `git` and in worktree lists in every store. The marker in
the pull request body is what readers on the forge use, because a reader may not have the other stores' clones.

**Case for the marker alone:** less coupling between stores' branch names. **Why both:** the branch name costs
nothing, and it lets a person or agent standing in one store see that a worktree belongs to a session elsewhere.
Session start refuses a name that is already taken in the store, so the shared name never collides silently.

**On forged markers:** anyone who can open a pull request on a store can write a marker naming someone else's
session. That only adds a visible part to the session. The page shows every part, and a decision binds every head
shown (D4), so a forged part is either seen and refused, or approved knowingly. A pull request without a
well-formed marker is a session of its own, so a missing or broken marker falls back to today's behavior.

### D3. A session decision is a review on every part

Approving records one review per pull request, by the same recording login. Each marker names the session and the
head of every part. The readers' rules are unchanged: only the recording login's reviews count, and the latest one
decides.

**Case for a single session record** (one comment on the home pull request, or an issue): one write instead of
several, and one place to read. **Why reviews on every part:** each store's own `ctxr land` and `review list`
already read decisions from their own pull requests. A record held in another repository would make a store's
landing depend on reading a repository it does not own. And on GitHub, an approving review is what branch
protection understands.

### D4. Changing any part reopens the whole session

The approval counts for a part only while every head in its marker is still current, or carried over by an
unchanged-patch rebase.

**Case for checking each part on its own:** a push to the home part would not disturb an already-approved family
part, so less approving again. **Why the whole session:** the decider approved a combination. The family copy of a
note and the removal of its original in the person's store are one change. Approving them separately is the
problem this change removes.

### D5. A decider must be a decider of every store the session touches

**Case for "a decider of the home store is enough":** the person approving is the one who did the work, and their
own page is the point. **Why not:** the home store's page would then approve changes into a store whose own
deciders might not include that person. A store's deciders are its own decision, wherever the page runs. For a
family store, both people are deciders, so each approves from their own page.

The deciders of a mounted store are read from its `contexture.yaml` on its default branch on the forge, at decision
time, not from the mount's clone. A mount's clone can be behind, and a decider removed from a shared store must stop
being able to approve its changes as soon as that change merges.

### D6. Mounted parts land first, each by its own store

A home part waits as `waiting` until the session's parts in mounted stores have merged. Each store's own landing
sweep lands its own part.

**Case for the home store's `serve` landing every part:** one sweep, and no wait between them. **Why each store
lands its own:** landing is where a store's resolver, consent check and credential boundary apply, and those
belong to that store. The cost is latency: up to two sweeps, about ten minutes, between the mounted part and the
home part.

**Why mounted first:** a mounted store has more readers than the store that mounts it. If landing stops between the
two, the state left is "the note is in the family store and still in mine": nothing has left the readers who should
have it. The other order could remove a note from its owner before the family store has it.

### D7. Consent in chat lands a whole session with `--session`

`ctxr land --session <session> --confirm` runs in the home store and lands each part from its clone: the mounts'
parts first, from `shared/<name>/`, then the home part. It uses the credential of the agent that runs it, which
needs merge rights on each store. It stops at the first part it cannot land.

**Case for leaving chat consent per pull request:** nothing new to build. **Why not:** saying "land it" once is
the chat form of approving once. Without `--session`, the agent would land the parts one by one and could get the
order wrong.

### D8. `serve` reads mounted pull requests through the forge, and fetches into a cache of its own

The index and page read each mount's open pull requests with the recording identity. To show a part's change,
`serve` needs that part's commits, but the part may have been written from another person's container, and the
store's clone is mounted read-only for `serve`. So `serve` fetches the heads it shows into a cache directory of its
own, one bare repository per store, outside the store. It is derived, disposable, and rebuilt on demand.

**Case for asking the forge for the diff instead:** no cache at all. **Why fetch:** the approval page computes the
knowledge changes (graph delta) and page previews from commits, and the forge's diff gives neither.

### D9. No configuration key

Which stores are in reach comes from the mounts list, and who decides comes from each store's `change_approval`.
Nothing else is a choice a store needs to make.

## Risks / Trade-offs

- **[More forge calls per page view]** One listing per mounted store, plus fetches. → A person mounts a handful of
  stores. The App's rate limit, 5000 requests an hour per installation, is far above that.
- **[The App must be installed on every store a session touches]** A missing installation makes that store's part
  unreadable. → The index reports it for that store, and offers no decision on sessions with a part there.
- **[`waiting` looks stuck]** A home part can sit approved for two sweeps. → `review list` and the page name the
  parts it waits for.
- **[A part abandoned in a mounted store holds the home part forever]** → A closed, unmerged part stops the
  session. `review list` reports it as `blocked`, naming it, and the person either reopens it or closes the
  session's other parts.
- **[Two people work in the same shared store at once]** Their sessions are separate sessions with separate
  branches, and they land independently. Conflicts go through the existing resolver and re-approval.

## Migration Plan

None required. A pull request without a session marker behaves exactly as today. Stores pick this up with a ctxr
release. Rolling back leaves markers in pull request bodies, which older readers ignore.

## Open Questions

None that change the specs. The cache location for D8 (a directory under the `serve` container's own writable
paths, or a small volume) is settled at implementation.
