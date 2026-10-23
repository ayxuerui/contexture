## Revisions after critique

A three-model critique (2026-10-23, all three APPROVE_WITH_CHANGES, no veto) changed the following. These override
anything inconsistent below; D2, D6 and D8 are rewritten in place.

1. **The decision's list of parts is what landing trusts** (skeptic, major). Landing used to wait only for the
   mounted parts it could find open. A mounted part closed, or with its marker removed, would vanish, and the home
   part, which removes the original note, would land without the copy. Now the approval marker names every part's
   store, number and head. Landing works from that list: a named part closed unmerged blocks the session, and an
   open part carrying the marker that the decision does not name reopens it.
2. **The home store lands the whole session; a session is decided only on its home page** (architect, major,
   diagnosis; pragmatist, repair). As first written, a mounted store's own sweep landed its part. To check that
   part's consent it would have had to read the home store's heads, from a store it has no relationship with: one
   family store is mounted by many homes. And the mounted store's own page could decide the part alone. Now the
   home's sweep lands every part, mounted parts first, each in that mount's clone under that mount's own
   configuration. A store's sweep skips pull requests homed elsewhere, and other stores' pages show them as homed
   elsewhere, with no decision.
3. **A part already merged counts as landed** (architect), so `--session` and a sweep acting at the same moment
   never stop each other.
4. **A joined branch names its home** (architect): `session/<home store>/<home branch without prefix>`, so sessions
   from different homes never collide in a store many people mount. Grouping uses the marker alone (pragmatist),
   not branch names.
5. **No separate cache** (pragmatist). D8 assumed `serve` mounts the store read-only. It does not: on the live host
   `serve` mounts `/store` read-write, because it lands. It fetches a mounted part's head into that mount's own
   clone, under a ref namespace of its own.

**Kept as first proposed:** mounted parts land before the home part. All three reviewers kept that order, and
revision 2 keeps it while moving the sequencing into one lander.

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
- **`serve` runs in its own container** (`serve-lands-approved-changes` D5: the App key never reaches the agents'
  container), with the store mounted read-write so it can land.

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

### D2. The marker groups a session; a joined branch names its home

Every pull request of a session carries a marker naming the session; the marker alone groups the parts, because a
reader on the forge may not have the other stores' clones. A joined session's branch is
`session/<home store>/<home branch without prefix>`, so a person or agent standing in a mount can see where a
worktree's work began, and sessions homed in different stores never collide in a store many people mount.

**Case for the home branch name verbatim:** the same name in every store. **Why prefix it:** a family or company
store is mounted by many homes, and two homes can both have a `session/20261023-0700-…` branch.

**On forged markers:** anyone who can open a pull request on a store can write a marker naming someone else's
session. Before a decision, that only adds a visible part to the session's page. After a decision, an unnamed part
carrying the marker reopens the session (D4), so a forgery can delay a landing but never ride one. A pull request
without a well-formed marker is a session of its own, so a missing or broken marker falls back to today's behavior.

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

### D6. The home store lands the whole session, mounted parts first

The home's landing sweep lands every part its decision names: each mounted part in that mount's clone, under that
mount's own configuration (its resolver, consent check and landing commits), then the home part. A store's sweep
leaves alone any pull request whose session is homed elsewhere. A part already merged counts as landed.

**Case for each store landing its own part** (as first proposed): landing is where a store's rules apply, and a
store's own sweep applies them without depending on any other store. **Why the home lands:** to check a part's
consent, a mounted store's sweep would have to read the home store's heads, and it has no relationship with the
stores that mount it: a family store is mounted by every member's store, a company store by twenty. Sequencing in
one lander removes that, removes a `waiting` state spread across sweeps, and lands a session in one run rather
than two. The mount's own rules still apply, because the part is landed in the mount's clone with the mount's
configuration. Every store a person runs uses the same GitHub App, so no credential crosses a boundary it did not
already cross.

**Why mounted first:** a mounted store has more readers than the store that mounts it. If landing stops between
the two, the state left is "the note is in the family store and still in mine": nothing has left the readers who
should have it. The other order could remove a note from its owner before the family store has it.

### D7. Consent in chat lands a whole session with `--session`

`ctxr land --session <session> --confirm` runs in the home store and lands each part from its clone: the mounts'
parts first, from `shared/<name>/`, then the home part. It uses the credential of the agent that runs it, which
needs merge rights on each store. It stops at the first part it cannot land.

**Case for leaving chat consent per pull request:** nothing new to build. **Why not:** saying "land it" once is
the chat form of approving once. Without `--session`, the agent would land the parts one by one and could get the
order wrong.

### D8. `serve` reads mounted pull requests through the forge, and fetches into the mount's clone

The index and page read each mount's open pull requests with the recording identity. To show a part's change,
`serve` needs that part's commits, which may have been written from another person's container. It fetches the
heads it shows into the mount's own clone under a ref namespace of its own, leaving branches and the working tree
alone. `serve` already mounts the store read-write, because it lands.

**Case for asking the forge for the diff instead:** no fetch at all. **Why fetch:** the approval page computes the
knowledge changes (graph delta) and page previews from commits, and the forge's diff gives neither.

### D9. No configuration key

Which stores are in reach comes from the mounts list, and who decides comes from each store's `change_approval`.
Nothing else is a choice a store needs to make.

## Risks / Trade-offs

- **[More forge calls per page view]** One listing per mounted store, plus fetches. → A person mounts a handful of
  stores. The App's rate limit, 5000 requests an hour per installation, is far above that.
- **[The App must be installed on every store a session touches]** A missing installation makes that store's part
  unreadable. → The index reports it for that store, and offers no decision on sessions with a part there.
- **[A part abandoned in a mounted store holds the home part forever]** → A named part closed unmerged blocks the
  session. `review list` reports it as `blocked`, naming it, and the person either reopens it or closes the
  session's other parts.
- **[A store mounted by a home that is down]** Its parts of that home's sessions stay open until the home's
  `serve` runs again. → They are visible on every page that mounts the store, as homed elsewhere.
- **[Two people work in the same shared store at once]** Their sessions are separate sessions with separate
  branches, and they land independently. Conflicts go through the existing resolver and re-approval.

## Migration Plan

None required. A pull request without a session marker behaves exactly as today. Stores pick this up with a ctxr
release. Rolling back leaves markers in pull request bodies, which older readers ignore.

## Open Questions

None.
