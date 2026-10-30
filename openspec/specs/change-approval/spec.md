# change-approval Specification

## Purpose
Lets a person who owns a store's content approve, or ask for changes to, a session's change from a page served
by `ctxr serve`, without a forge account. The decision is recorded on the forge, attributed to that person's
verified identity, so that the landing path can act on it.

## Requirements

### Requirement: Change approval is opt-in and absent until configured
A store SHALL enable change approval only by declaring a `change_approval` block in `contexture.yaml`. The block
SHALL carry no shipped default. It SHALL name the identity assertion to verify (the request header that carries
it, the issuer, the audience and the key-set address), the deciders (each entry either an exact email address
or an `@domain` suffix), and the forge login of the identity that records decisions. Configuration validation
SHALL reject a `change_approval` block when `serve.base_url` is absent, naming both keys. With no
`change_approval` block, every `/approve/` route SHALL answer `404`, and no method other than `GET` and `HEAD`
SHALL be admitted on any route.

#### Scenario: A store without the block has no approval surface
- **WHEN** `ctxr serve` runs for a store whose `contexture.yaml` has no `change_approval` block, and `/approve/`
  is requested
- **THEN** the response is `404`, and a `POST` to any path is answered `405`

#### Scenario: The block requires a base URL
- **WHEN** `contexture.yaml` declares `change_approval` and no `serve.base_url`
- **THEN** configuration loading fails, naming `change_approval` and `serve.base_url`

#### Scenario: A newly initialized store carries no change_approval block
- **WHEN** `ctxr init` creates a store
- **THEN** its `contexture.yaml` carries no `change_approval` key

### Requirement: Every approval route requires a verified identity assertion
Every `/approve/` route SHALL verify the configured identity assertion before it reads anything. The server
SHALL accept the assertion only when it is a signed token from the configured header, its signature verifies
against a key in the configured key set, its issuer and audience equal the configured values, it is not
expired, and it carries an email claim. A request that fails any of these checks SHALL receive `401`, with no
store content and no forge state in the response. The verified email SHALL be the requester's identity for that
request. A request whose identity matches no configured decider SHALL receive `403` on every approval route.
The verification SHALL be performed by the server for each request. Being able to reach the server SHALL NOT
count as an identity.

#### Scenario: A request with no assertion is refused
- **WHEN** `/approve/` is requested with no identity assertion header, as from a client that reached the bound
  address without passing through the access proxy
- **THEN** the response is `401` and carries no worktree name, path or pull request

#### Scenario: A forged assertion is refused
- **WHEN** the assertion header carries a token signed by a key that is not in the configured key set
- **THEN** the response is `401`

#### Scenario: An assertion for another audience is refused
- **WHEN** the assertion verifies but its audience is not the configured audience
- **THEN** the response is `401`

#### Scenario: A verified non-decider is refused
- **WHEN** the assertion verifies with email `someone@other.example` and the deciders are `@example.com` and
  `ops@ctx-a.example`
- **THEN** the response is `403`

#### Scenario: A domain entry admits its domain only
- **WHEN** the deciders list `@example.com`, and the verified email is `a@example.com.evil.test`
- **THEN** the response is `403`

### Requirement: The approval index lists every session awaiting a decision
`GET /approve/` SHALL list each session worktree (the same worktrees the review route addresses) whose branch
has an open pull request on the forge. Each entry SHALL give the worktree name linked to its approval page, the
pull request number, the head commit, and the decision state as `ctxr review list` reports it. A session
worktree with no open pull request SHALL NOT be listed. When the forge cannot be reached, the index SHALL say
so and SHALL offer no decision.

#### Scenario: An open pull request is listed with its state
- **WHEN** worktree `work-ctx-a` has an open pull request with no decision, and worktree `work-ctx-b` has no
  pull request
- **THEN** `/approve/` lists `work-ctx-a` as awaiting a decision with its pull request number and head commit,
  and does not list `work-ctx-b`

### Requirement: The approval page shows the change itself
`GET /approve/<worktree>` SHALL render, through the same shell as every other HTML route: every fact the review
route shows for that worktree; for each file under the store root that differs between the base and the head
the review route compares (derived cache paths excluded), the file's path and its changes as removed and added
lines; the pull request number; the full head commit id; and the current decision state.

The page SHALL also show the author's account of the change: the pull request's title, its body rendered as
markdown, and the full message of every commit in the compared range. These SHALL appear in a section of their
own, labelled as the author's account, and SHALL NOT be interleaved with the derived facts or the diff. Raw
HTML in the body or a commit message SHALL be shown as escaped text and never rendered as markup.

For every page under the publish path that the compared range adds, modifies, moves or removes, as
`ctxr publish urls` reports it, the page SHALL show the page's status and link its preview and published
addresses, stating for each address when it resolves.

Its content SHALL be readable, and its decision controls usable, with client-side scripting disabled. Rendering the page SHALL NOT fetch,
check out, or write anything in the repository.

The diff on the page SHALL be computed from the committed head. Uncommitted work in the worktree SHALL NOT
appear on the page.

#### Scenario: A changed note's text is shown
- **WHEN** worktree `work-ctx-a`'s head adds a line to note `ctx-a/topic.md` and removes another
- **THEN** the approval page shows `ctx-a/topic.md` with the removed line and the added line marked as such

#### Scenario: The author's account is shown and labelled
- **WHEN** worktree `work-ctx-a`'s pull request has a title and a body explaining what changed and why, and its
  range has two commits
- **THEN** the approval page shows the title, the rendered body and both commit messages in a section labelled
  as the author's account, separate from the knowledge-change facts and the diff

#### Scenario: Raw HTML in the author's account is not rendered
- **WHEN** the pull request body contains `<script>` or another raw HTML element
- **THEN** the approval page shows it as escaped text, and the response carries no markup from the body

#### Scenario: A changed page links to its preview
- **WHEN** the compared range adds a page under the publish path
- **THEN** the approval page lists that page with its status, a link to its preview address and its published
  address, and states when each resolves

#### Scenario: The page works without script
- **WHEN** the approval page is rendered with client-side scripting disabled
- **THEN** every changed file's changes are visible, and the Approve and Request changes controls submit as
  plain form posts

#### Scenario: Uncommitted work is not shown
- **WHEN** the worktree has an uncommitted edit to a note
- **THEN** the approval page does not show that edit, and the worktree's `git status --porcelain` output is
  unchanged afterward

#### Scenario: A worktree that already landed says so
- **WHEN** `/approve/<worktree>` is requested after `ctxr land` merged its pull request and reclaimed the worktree
- **THEN** the response is `200`, stating that the change landed, with the pull request number and the merged
  commit id

### Requirement: A decision is accepted only for the head the decider saw
`POST /approve/<worktree>/decision` SHALL be the only route that admits `POST`. It SHALL require: a verified
decider identity; an `Origin` header equal to the origin of `serve.base_url`; a decision of `approve` or
`request-changes`; the head commit id the page showed; and, for `request-changes`, a non-empty comment. The
server SHALL refuse the decision, and record nothing, when the head commit id is not the current head of the
pull request on the forge, when the pull request is not open, or when any requirement above is unmet. A refusal
for a moved head SHALL render the page for the current head with a notice naming both commit ids.

#### Scenario: A cross-site post is refused
- **WHEN** a decision is posted with an `Origin` header that differs from the origin of `serve.base_url`
- **THEN** the response is `403` and no review is recorded on the forge

#### Scenario: A decision for a stale head is refused
- **WHEN** the page was rendered for head `h1`, the branch then moved to `h2`, and the decider posts approve for `h1`
- **THEN** no review is recorded, and the response shows the page for `h2` with a notice naming `h1` and `h2`

#### Scenario: Request changes needs a comment
- **WHEN** `request-changes` is posted with an empty comment
- **THEN** the decision is refused and no review is recorded

### Requirement: A decision is recorded on the forge as a review attributed to the decider
An accepted decision SHALL be recorded as a pull-request review posted with the server's forge credential:
`approve` as an approving review, and `request-changes` as a review requesting changes that carries the
comment. Each review body SHALL state, in a sentence, the decider's verified email and the short head commit,
and SHALL carry a machine-readable marker giving the decision, the full head commit id, the decider's email and
the time of the decision. At start, the server SHALL check that its forge credential's login equals the
configured recording login, and SHALL refuse to start, naming both logins, when they differ. The response to an
accepted decision SHALL show the recorded state, read back from the forge.

#### Scenario: Approve records an approving review naming the decider
- **WHEN** decider `a@example.com` approves worktree `work-ctx-a` at head `h1`
- **THEN** the pull request carries an approving review by the configured recording login whose body names
  `a@example.com` and `h1`, and whose marker gives `approve`, the full `h1`, the email and a time

#### Scenario: Request changes carries the comment
- **WHEN** a decider requests changes with comment "the second section contradicts the policy note"
- **THEN** the pull request carries a changes-requested review whose body includes that comment and names the decider

#### Scenario: A mismatched credential stops the server
- **WHEN** `change_approval` names recording login `ctx-approvals` and the server's forge credential
  authenticates as `ctx-agent`
- **THEN** `ctxr serve` exits non-zero before binding, naming both logins

### Requirement: Only reviews by the recording identity count as decisions
Every reader of decisions (`ctxr review list`, `ctxr land`, and the approval routes) SHALL treat a pull-request
review as a decision only when it was posted by the configured recording login and carries a well-formed
marker. It SHALL take the latest such review as the pull request's decision. A marker in a review by any other
login, or in a comment, SHALL be ignored.

#### Scenario: A marker from another account is ignored
- **WHEN** a review by login `ctx-agent` carries a well-formed approve marker for the current head
- **THEN** `ctxr review list` reports the pull request as awaiting a decision

### Requirement: The review state of every open session pull request is reported
`ctxr review list` SHALL report each session worktree with an open pull request. It SHALL give the pull request
number, the head commit, the decision state, and for a decision the decider and time. A changes-requested state
SHALL include the comment. The decision state SHALL be exactly one of:
- `awaiting`: there is no decision.
- `approved`: the latest decision approves the current head, or approves a head the current head carries over
  from (see write-lifecycle).
- `changes-requested`: the latest decision requests changes.
- `needs-reapproval`: the latest decision approves a head that the current head does not carry over from.
- `blocked`: `ctxr land` recorded that it could not proceed, with its reason.

The command SHALL support the standard `--json` envelope. When the forge cannot be reached, it SHALL exit with
the setup/usage code and SHALL say so, rather than reporting every pull request as awaiting.

#### Scenario: Requested changes reach an agent with their comment
- **WHEN** a decider requested changes on the pull request of worktree `work-ctx-a`
- **THEN** `ctxr review list --json` reports `work-ctx-a` as `changes-requested` with the comment, the decider
  and the time

#### Scenario: A pushed commit after approval needs re-approval
- **WHEN** a decider approved head `h1`, and a later commit that changes a file was pushed, making the head `h2`
- **THEN** `ctxr review list` reports `needs-reapproval`

#### Scenario: An unreachable forge is not reported as awaiting
- **WHEN** `ctxr review list` runs and the forge cannot be reached
- **THEN** it exits with the setup/usage code, naming the forge as unreachable

### Requirement: The recording identity may be a GitHub App with credentials from the environment only
The commands that read or record decisions (`ctxr serve`, `ctxr review list`, `ctxr land`) SHALL authenticate to
the forge as a GitHub App when the environment sets `CONTEXTURE_GITHUB_APP_ID` and exactly one of
`CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` (a path to a PEM file) or `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` (PEM
text). Otherwise they SHALL authenticate as `gh` does by itself. No key, key path or App ID SHALL be read from
`contexture.yaml`. A command SHALL exit with the setup/usage code, naming the variables involved, when only part
of the App credential is set, when both key variables are set, when the key file cannot be read, or when the key
is not a usable RSA private key. Each command's envelope SHALL state whether it authenticated as an App or with
`gh`'s own credential, and SHALL NOT include any key, assertion or token.

#### Scenario: Without App variables nothing changes
- **WHEN** none of the `CONTEXTURE_GITHUB_APP_*` variables is set
- **THEN** the commands call the forge through `gh` with the environment they were given, and the envelope
  reports `gh`'s own credential

#### Scenario: A partial App credential is refused
- **WHEN** `CONTEXTURE_GITHUB_APP_ID` is set and neither key variable is
- **THEN** the command exits with the setup/usage code naming `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and
  `CONTEXTURE_GITHUB_APP_PRIVATE_KEY`, before any forge call

#### Scenario: Two key sources are refused
- **WHEN** both `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` are set
- **THEN** the command exits with the setup/usage code naming both, rather than choosing one

#### Scenario: No secret reaches the envelope
- **WHEN** a command runs as an App with `--json`
- **THEN** its output contains no part of the private key, the signed assertion, or the installation token

### Requirement: An App's installation token is minted on demand and replaced before it expires
In App mode, a command SHALL find the App's installation on the store's repository (the repository its `origin`
remote names) by asking the forge, using an assertion signed with the private key that is valid for no more than
ten minutes. It SHALL exchange that assertion for an installation token. It SHALL use one token for every forge
call until less than five minutes of the token's life remain, and SHALL then mint a new one before the next
call. When the App is not installed on that repository, the command SHALL exit with the setup/usage code,
naming the repository and the App. A long-running `ctxr serve` SHALL keep recording decisions across any
number of token lifetimes without a restart.

#### Scenario: A token is reused while fresh
- **WHEN** two forge calls are made one minute apart with a token that has fifty minutes of life left
- **THEN** both calls use the same token, and no new token is minted

#### Scenario: A token near expiry is replaced
- **WHEN** a forge call is made with a token that has four minutes of life left
- **THEN** a new token is minted first, and the call uses it

#### Scenario: An App not installed on the repository is named
- **WHEN** the App has no installation on the store's repository
- **THEN** the command exits with the setup/usage code, naming the repository and the App ID

### Requirement: An App's identity check uses the App's own record
In App mode, the start-time check that the server's forge credential is the configured recording login SHALL
compare `recording_login` with the App's slug followed by `[bot]`, as the forge reports the App's slug for the
signed assertion. That check SHALL NOT call the forge's current-user endpoint. `ctxr land`'s check of whether
its credential is the recording login SHALL use the same comparison.

#### Scenario: The App's bot login is the recording login
- **WHEN** the App's slug is `ctx-a-approvals` and `recording_login` is `ctx-a-approvals[bot]`
- **THEN** `ctxr serve` starts, and decisions it records are reviews by `ctx-a-approvals[bot]`

#### Scenario: A mismatched App is refused
- **WHEN** the App's slug is `ctx-a-approvals` and `recording_login` is `ctx-approvals`
- **THEN** `ctxr serve` exits non-zero before binding, naming `ctx-approvals` and `ctx-a-approvals[bot]`

### Requirement: The approval routes follow the configuration the server last loaded
The approval routes SHALL follow the configuration that `ctxr serve` last loaded (context-browsing: "The server
follows changes to the store's configuration"). When a loaded change adds a `change_approval` block, the server
SHALL build the approval surface from it. That includes resolving the forge credential and checking that its
login is the recording login. When a loaded change alters the block or `serve.base_url`, the server SHALL rebuild
the surface. When a loaded change removes the block, the approval routes SHALL answer `404`, and `POST` SHALL
answer `405`, exactly as for a store that never declared it.

After startup, an approval surface that cannot be built SHALL NOT stop the server. Reasons include an unreachable
forge, a credential that is refused, or a recording login that does not match. Instead every approval route SHALL
answer `503` with a body naming the problem and no secret. Every other route SHALL keep answering. The server
SHALL write one line to stderr naming the problem. A request that arrives while the surface answers `503` SHALL
try to build it again, at most once every thirty seconds, so that a forge that comes back, or a corrected
configuration, takes effect without a restart.

At startup, a recording login that does not match still stops the server before it binds (as "A decision is
recorded on the forge as a review attributed to the decider" requires).

#### Scenario: Approval turned on after startup
- **WHEN** a server started with no `change_approval` block, and the block is then added to its configuration
  file
- **THEN** the next `GET /approve/` with a verified decider's assertion answers `200`, with no restart

#### Scenario: A decider added after startup
- **WHEN** `b@example.com` is added to the deciders of a running server's configuration
- **THEN** the next request with `b@example.com`'s verified assertion is admitted, where it was answered `403`
  before the change

#### Scenario: Approval turned off after startup
- **WHEN** the `change_approval` block is removed from a running server's configuration file
- **THEN** `/approve/` answers `404`, and a `POST` to a decision route answers `405`

#### Scenario: A recording-login mismatch after startup degrades the approval routes only
- **WHEN** a loaded change sets `recording_login` to a login the server's credential does not authenticate as
- **THEN** every `/approve/` route answers `503` naming both logins, notes and published pages still answer
  `200`, and the server keeps running

#### Scenario: A recovered forge is picked up
- **WHEN** the approval surface answered `503` because the forge was unreachable, and the forge is reachable
  again more than thirty seconds later
- **THEN** the next approval request builds the surface and is answered normally

### Requirement: The server lands what was approved
While the configuration `ctxr serve` has loaded declares `change_approval`, and its `land` key is absent or
`auto`, the server SHALL land approved changes by running `ctxr land --pending` for its store as a separate
process. It SHALL start a run after it accepts an Approve decision, and SHALL also start one at least every five
minutes while it runs. It SHALL NOT run two at once. A start requested while a run is in progress SHALL produce
exactly one further run after it ends. A run's output SHALL go to the server's stderr, and SHALL NOT go to its
stdout. No run, and no failure of a run, SHALL change how any request is answered, beyond what the run itself
records on the forge.

When `land` is `manual`, or the loaded configuration stops declaring `change_approval`, the server SHALL start no
further runs. When the server stops, it SHALL stop a run in progress.

`change_approval.land` SHALL accept only `auto` or `manual`. It SHALL carry no shipped default, and absent SHALL
mean `auto`.

#### Scenario: An approval lands without a scheduler
- **WHEN** a decider approves a mergeable session pull request on a running server whose configuration declares
  `change_approval` and no `land` key
- **THEN** the pull request is merged and its worktree removed, with no other process running `ctxr land`

#### Scenario: Runs never overlap
- **WHEN** three approvals are accepted while a landing run is in progress
- **THEN** exactly one further run starts after the current one ends, and at no time do two runs exist

#### Scenario: Manual landing is respected
- **WHEN** the configuration declares `change_approval` with `land: manual`, and a decider approves a change
- **THEN** the server starts no landing run, and the pull request stays open and approved

#### Scenario: A landing failure leaves browsing alone
- **WHEN** a landing run exits non-zero because a change is blocked by a conflict
- **THEN** the server's stderr carries the run's output, and every route answers as before

#### Scenario: The periodic sweep catches an approval made while the server was down
- **WHEN** a pull request was approved while the server was stopped, and the server is then started
- **THEN** a landing run starts within five minutes of startup and lands it

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
