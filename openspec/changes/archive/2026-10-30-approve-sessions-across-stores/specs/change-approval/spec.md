## ADDED Requirements

### Requirement: The approval index lists sessions across the store and its mounts
A store that declares no `shared_stores` SHALL list, show and decide its own pull requests exactly as before this
change, marker or not. When the store declares mounts, `GET /approve/` SHALL list each session that has at least one open pull request on
the store or on a present mount the store declares, grouped by session as the write lifecycle defines it. Each entry
SHALL give the session, its home store, and for each of its pull requests the store it belongs to, its number, its
head commit and its decision state. A session SHALL be listed once, however many stores its pull requests are on.
Sessions homed in another store SHALL be listed apart from this store's own, in a section that names each one's
home and offers no decision, so that what other people are bringing into a mounted store is visible without
crowding what this store's deciders can act on. The server SHALL read each
mounted store's pull requests with its configured recording identity. When the forge cannot be reached for a store,
the index SHALL say so for that store and SHALL offer no decision on a session with a part there.

#### Scenario: A session with parts in two stores is listed once
- **WHEN** the store `ctx-a` mounts `ctx-b`, and session `session/20261023-0700-ctx-move`, homed in `ctx-a`, has an
  open pull request on each
- **THEN** `/approve/` on `ctx-a` lists that session once, with both pull requests, each under its own store

#### Scenario: A session homed elsewhere is shown but not decided
- **WHEN** the store `ctx-c` also mounts `ctx-b`, and the session homed in `ctx-a` has an open part on `ctx-b`
- **THEN** `/approve/` on `ctx-c` lists that part in the section for sessions homed elsewhere, naming `ctx-a`, and
  offers no decision on it

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
not a decider of every store the session has a part in. The home store's deciders SHALL be those of the
configuration `serve` has loaded, which follows the home store's default branch. Each mounted store's deciders
SHALL be read from that store's `change_approval` in its `contexture.yaml` on its default branch on the forge, at
decision time; a mounted store with no `change_approval` SHALL have no deciders.

An accepted decision SHALL have a unique decision id, and SHALL be recorded as reviews by the recording login, each
marked as a single pull request's decision is and also naming the decision id, the session, and the store, number
and head of every part. The decision's record SHALL be its review on one part, the record part: the home store's
part when the session has one, and otherwise the first named part in landing order. The server SHALL post the
record review first, then a review on every other part as a copy carrying the same marker. When posting a copy
fails, the decision SHALL still stand, and the response SHALL say which copies are missing.

Every part's decision SHALL be read, posted and checked with the home store's recording login. This assumes every
store a session touches records with the same identity; a mounted store whose `change_approval.recording_login`
differs cannot take part in sessions homed in another store, since its own readers would not count the home's
reviews.

Every reader SHALL take a session's decision from its record part alone. The parts the record names SHALL be the
session's parts for landing. Before landing a part other than the record part, landing SHALL post that part's copy
when it is missing, and SHALL never post a copy whose decision id differs from the record's. The decision SHALL
count as consent for a part only while every part it names keeps the head the record gives, or a head that part's
current head carries over from (per write-lifecycle), and while no open pull request carrying the session's marker
exists that the record does not name. Otherwise `ctxr review list` and `ctxr land` SHALL report every part as
`needs-reapproval`.

#### Scenario: Approving a session records a review on every part
- **WHEN** decider `a@example.com`, a decider of both `ctx-a` and `ctx-b`, approves a session homed in `ctx-a` at
  heads `h1` on `ctx-b` and `h2` on `ctx-a`
- **THEN** `ctx-a`'s pull request carries the record review and `ctx-b`'s a copy, each by the recording login with a
  marker naming one decision id, the session, both stores' pull requests with `h1` and `h2`, and `a@example.com`

#### Scenario: A missing copy is posted before its part lands
- **WHEN** the record review on `ctx-a`'s part was posted and the copy on `ctx-b`'s part failed
- **THEN** the session reads as approved, and landing posts the copy on `ctx-b`'s part before merging it

#### Scenario: A session with no part in its home store records on its first part
- **WHEN** a session homed in `ctx-a` has open parts only on `ctx-b` and is approved
- **THEN** the record review is posted on `ctx-b`'s part, and every reader takes the decision from it

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
SHALL report a part's decision state from its session's decision. A session landing left unfinished SHALL be
reported as `blocked` (a named part closed without merging; it waits for a person) or `retrying` (it lands on a
later run), naming the part and why. `retrying` SHALL be read from the landing record the run left on the record
part, until the part it names merges, and also SHALL be reported while some named parts have merged and others are
still open. The other states SHALL keep their meanings.

#### Scenario: A closed mounted part blocks the session in the report
- **WHEN** a session's part on mounted store `ctx-b` was closed without merging after the session was approved
- **THEN** `ctxr review list` in `ctx-a` reports the session as `blocked`, naming `ctx-b`'s part
