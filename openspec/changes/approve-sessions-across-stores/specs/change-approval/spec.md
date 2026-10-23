## ADDED Requirements

### Requirement: The approval index lists sessions across the store and its mounts
When the store declares mounts, `GET /approve/` SHALL list each session that has at least one open pull request on
the store or on a present mount the store declares, grouped by session as the write lifecycle defines it. Each entry
SHALL give the session, and for each of its pull requests the store it belongs to, its number, its head commit and
its decision state. A session SHALL be listed once, however many stores its pull requests are on. The server SHALL
read each mounted store's pull requests with its configured recording identity. When the forge cannot be reached
for a store, the index SHALL say so for that store and SHALL offer no decision on a session with a part there.

#### Scenario: A session with parts in two stores is listed once
- **WHEN** the store `ctx-a` mounts `ctx-b`, and session `session/20261023-0700-ctx-move` has an open pull request
  on each
- **THEN** `/approve/` on `ctx-a` lists that session once, with both pull requests, each under its own store

#### Scenario: A mount the forge cannot reach blocks only its sessions
- **WHEN** the forge cannot be reached for `ctx-b`
- **THEN** the index says so for `ctx-b`, offers no decision on a session with a part on `ctx-b`, and still offers
  decisions on sessions only on `ctx-a`

### Requirement: The approval page shows every part of a session
The approval page for a session SHALL show, for each of its pull requests, the change as the approval page shows a
single pull request's change today, under a heading naming the store the pull request belongs to. It SHALL list the
parts in the order they will land: parts in mounted stores first, then the home store's part.

#### Scenario: The page names each part's store in landing order
- **WHEN** the page for a session with parts on `ctx-b` (mounted) and `ctx-a` (home) is rendered on `ctx-a`
- **THEN** the page shows `ctx-b`'s change first and `ctx-a`'s second, each under a heading naming its store

### Requirement: A session decision is recorded on every part and binds every head
A decision on a session SHALL be posted with the head commit of every one of its pull requests, as the page showed
them. The server SHALL refuse it, and record nothing on any pull request, when any of those heads is not that pull
request's current head, when any part is not open, or when the decider is not a decider of every store the session
has a part in. Each store's deciders SHALL be read from that store's own `change_approval`; a store with no
`change_approval` SHALL have no deciders. An accepted decision SHALL be recorded as one review on every part,
attributed and marked as a single pull request's decision is, and each marker SHALL also name the session and the
head of every part.

A recorded session approval SHALL count as consent for a part only while every head its marker names is still the
current head of its part, or is a head that part's current head carries over from (per write-lifecycle). Otherwise
`ctxr review list` and `ctxr land` SHALL report the part as `needs-reapproval`.

#### Scenario: Approving a session records a review on every part
- **WHEN** decider `a@example.com`, a decider of both `ctx-a` and `ctx-b`, approves a session at heads `h1` on
  `ctx-b` and `h2` on `ctx-a`
- **THEN** each pull request carries an approving review by the recording login whose marker names the session,
  `h1` and `h2`, and `a@example.com`

#### Scenario: A decider of one store only is refused
- **WHEN** `b@example.com` is a decider of `ctx-a` but not of `ctx-b`, and approves a session with a part on each
- **THEN** the decision is refused, naming `ctx-b`, and no review is recorded on either pull request

#### Scenario: A change to one part reopens the whole session
- **WHEN** a session was approved at `h1` on `ctx-b` and `h2` on `ctx-a`, and a commit that changes a file is then
  pushed to `ctx-b`'s part
- **THEN** both parts are reported as `needs-reapproval`, and neither lands

#### Scenario: Requesting changes reaches every part
- **WHEN** a decider requests changes on a session with a comment
- **THEN** every part carries a changes-requested review with that comment

### Requirement: The review state is reported by session
`ctxr review list` SHALL report, for each session pull request, the session it belongs to, and SHALL report a
part's decision state from its session's decision. A part held by landing until other parts merge SHALL be reported
as `waiting`, naming the parts it waits for. The other states SHALL keep their meanings.

#### Scenario: A home part held for its mounted part reports waiting
- **WHEN** a session is approved and its part on mounted store `ctx-b` is still open
- **THEN** `ctxr review list` in `ctx-a` reports `ctx-a`'s part as `waiting` on `ctx-b`'s part
