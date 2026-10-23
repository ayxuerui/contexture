## ADDED Requirements

### Requirement: The approval index lists sessions across the store and its mounts
When the store declares mounts, `GET /approve/` SHALL list each session that has at least one open pull request on
the store or on a present mount the store declares, grouped by session as the write lifecycle defines it. Each entry
SHALL give the session, its home store, and for each of its pull requests the store it belongs to, its number, its
head commit and its decision state. A session SHALL be listed once, however many stores its pull requests are on. A
session homed in another store SHALL be listed as homed there and SHALL offer no decision. The server SHALL read each
mounted store's pull requests with its configured recording identity. When the forge cannot be reached for a store,
the index SHALL say so for that store and SHALL offer no decision on a session with a part there.

#### Scenario: A session with parts in two stores is listed once
- **WHEN** the store `ctx-a` mounts `ctx-b`, and session `session/20261023-0700-ctx-move`, homed in `ctx-a`, has an
  open pull request on each
- **THEN** `/approve/` on `ctx-a` lists that session once, with both pull requests, each under its own store

#### Scenario: A session homed elsewhere is shown but not decided
- **WHEN** the store `ctx-c` also mounts `ctx-b`, and the session homed in `ctx-a` has an open part on `ctx-b`
- **THEN** `/approve/` on `ctx-c` lists that part as belonging to a session homed in `ctx-a` and offers no decision on it

#### Scenario: A mount the forge cannot reach blocks only its sessions
- **WHEN** the forge cannot be reached for `ctx-b`
- **THEN** the index says so for `ctx-b`, offers no decision on a session with a part on `ctx-b`, and still offers
  decisions on sessions only on `ctx-a`

### Requirement: The approval page shows every part of a session
The approval page for a session SHALL show, for each of its pull requests, the change as the approval page shows a
single pull request's change today, under a heading naming the store the pull request belongs to. It SHALL list the
parts in the order they will land: parts in mounted stores first, then the home store's part. To show a mounted
part's change, the server SHALL fetch that part's head into the mount's own clone under a ref namespace of its own,
leaving the clone's branches and working tree untouched.

#### Scenario: The page names each part's store in landing order
- **WHEN** the page for a session with parts on `ctx-b` (mounted) and `ctx-a` (home) is rendered on `ctx-a`
- **THEN** the page shows `ctx-b`'s change first and `ctx-a`'s second, each under a heading naming its store

### Requirement: A session is decided only on its home store's page, for every part it names
A decision on a session SHALL be accepted only by the session's home store, and SHALL be posted with the store,
number and head commit of every one of its open pull requests, as the page showed them. The server SHALL refuse it,
and record nothing on any pull request, when any of those heads is not that pull request's current head, when any
part is not open, when the session's open parts on the forge differ from the parts posted, or when the decider is
not a decider of every store the session has a part in. Each store's deciders SHALL be read from that store's
`change_approval` in its `contexture.yaml` on its default branch on the forge, at decision time; a store with no
`change_approval` SHALL have no deciders. An accepted decision SHALL be recorded as one review on every part,
attributed and marked as a single pull request's decision is, and each marker SHALL also name the session and the
store, number and head of every part.

The parts a session approval's marker names SHALL be the session's parts for landing. The approval SHALL count as
consent for a part only while every part it names keeps the head the marker records, or a head that part's current
head carries over from (per write-lifecycle), and while no open pull request carrying the session's marker exists
that the decision does not name. Otherwise `ctxr review list` and `ctxr land` SHALL report every part as
`needs-reapproval`.

#### Scenario: Approving a session records a review on every part
- **WHEN** decider `a@example.com`, a decider of both `ctx-a` and `ctx-b`, approves a session homed in `ctx-a` at
  heads `h1` on `ctx-b` and `h2` on `ctx-a`
- **THEN** each pull request carries an approving review by the recording login whose marker names the session,
  both stores' pull requests with `h1` and `h2`, and `a@example.com`

#### Scenario: A decider of one store only is refused
- **WHEN** `b@example.com` is a decider of `ctx-a` but not of `ctx-b`, and approves a session with a part on each
- **THEN** the decision is refused, naming `ctx-b`, and no review is recorded on either pull request

#### Scenario: A change to one part reopens the whole session
- **WHEN** a session was approved at `h1` on `ctx-b` and `h2` on `ctx-a`, and a commit that changes a file is then
  pushed to `ctx-b`'s part
- **THEN** both parts are reported as `needs-reapproval`, and neither lands

#### Scenario: A part added after the decision reopens the session
- **WHEN** a session was approved, and a new open pull request carrying the session's marker then appears on `ctx-b`
- **THEN** every part is reported as `needs-reapproval`

#### Scenario: Requesting changes reaches every part
- **WHEN** a decider requests changes on a session with a comment
- **THEN** every part carries a changes-requested review with that comment

### Requirement: The review state is reported by session
`ctxr review list` SHALL report, for each session pull request, the session it belongs to and its home store, and
SHALL report a part's decision state from its session's decision. A session that landing could not finish SHALL be
reported as `blocked`, naming the part that stopped it. The other states SHALL keep their meanings.

#### Scenario: A blocked mounted part is named on every part
- **WHEN** a session's part on mounted store `ctx-b` cannot be landed because of a conflict
- **THEN** `ctxr review list` in `ctx-a` reports the session as `blocked`, naming `ctx-b`'s part and the conflict
