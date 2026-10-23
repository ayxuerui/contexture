## Why

With mounted stores (`mount-shared-stores`), one piece of work can touch more than one store. Moving a note into a
family store is a pull request on the family store, then another on the person's own store. Writing a family note
from a person's own agent is a pull request on a store whose approval page is somewhere else. Today every store
approves its own pull requests on its own page. So a person approves the same piece of work twice, on two pages,
and has to land the two pull requests in the right order by hand. The first person to set up a family store said
it plainly: approving twice at different places is silly.

What a person asked their agent for is one thing: a session. The approval page already lists sessions, not pull
requests. Today a session lives in one store. This change lets one session span the store it started in and the
stores that store mounts, and lets one decision, on the person's own page or in chat, approve and land all of it in
order.

## What Changes

- **A session can span stores.** A session started in a store is the session's home. When the work also writes
  into a mounted store, the agent starts a joined session inside that mount with `ctxr session start --joins
  <session>`. The joined session's branch names its home, and every pull request the session opens carries a
  marker naming the session. The marker, not the branch name, groups a session's pull requests.
- **A person's approval page lists their sessions across stores.** The page of the store a person's agent works
  in lists each open session with every pull request in it, in the home store and in each mount. It shows each
  pull request's change under the store it belongs to. A session is decided only on its home store's page; another
  store's page shows its parts as homed elsewhere.
- **One decision covers the whole session.** Approving records an approving review on every pull request in the
  session. Each review's marker names the session and the store, number and head of every pull request in it. That
  list is what landing works from. The approval stands only while every one of those heads is unchanged and no new
  part has appeared. Requesting changes records the comment on every pull request.
- **A decider must be a decider of every store the session touches.** The page reads each mounted store's own
  `change_approval.deciders`. It refuses a session decision from someone who is not a decider of one of them.
- **The home store lands the whole session, mounted parts first.** The home's `ctxr land --pending` lands each
  mounted part in that mount's clone under that mount's own configuration, then the home part. A part the decision
  names that cannot land, or was closed, blocks the session before the home part. A store's sweep leaves alone a
  pull request whose session is homed elsewhere. A part already merged counts as landed.
- **`ctxr land --session <session> --confirm`** lands a whole session in that order, for consent given in chat.
  It stops at the first pull request it cannot land and reports what landed.
- **`ctxr review list` reports the session** of each pull request and its session-wide state.
- **The submit, land and session-lifecycle skills** start joined sessions, submit every part of a session, and
  land by session.

## Non-goals

- **Approving a session in advance.** An approval is given for changes that are already written and shown. A
  standing "this session may land whatever it produces" would turn consent into a pre-authorization, and would let
  a prompt injection in a captured source land on its own.
- **Atomic landing across repositories.** Two repositories cannot merge as one transaction. Landing is in order
  and stops at the first failure; the order is chosen so that a stop leaves a safe state.
- **Requiring every member of a shared store to approve.** Any decider of every store a session touches may
  approve it, as any decider of a store may approve its pull requests today.
- **Turning a store's own approval page off.** A store such as a family store keeps its page; people simply stop
  needing it, because their own pages list its pull requests.
- **Sessions across stores that are not mounted.** A session spans its home store and the stores the home store
  declares as mounts, and nothing else.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `change-approval`: sessions are listed, shown and decided across the home store and its mounts; a session
  decision is recorded on every pull request and binds every head; a decider must be a decider of every store
  touched; `ctxr review list` reports sessions.
- `write-lifecycle`: a session can join one in another store; pull requests carry their session; landing holds a
  home pull request until the session's pull requests in mounted stores have merged; `ctxr land --session`.

## Impact

- **Depends on `mount-shared-stores`.** Mounts, the read view and root resolution into a mount come from that
  change, which must land first.
- `src/commands/session-start.ts` (`--joins`), `src/core/session.ts`, a session marker module beside
  `src/core/approval/decision.ts`.
- `src/core/approval/` (session grouping, the session decision, validity across heads), `src/core/browse/approve.ts`
  (the index and page), `src/commands/review-list.ts`, `src/commands/land.ts` (landing a session homed here in order, `--session`).
- `serve` reads the forge for each mounted store, using the same recording identity. The GitHub App must be
  installed on every store a person's sessions touch.
- Skills: `ctxr-session-lifecycle`, `ctxr-submit`, `ctxr-land`.
- No configuration key is added.
