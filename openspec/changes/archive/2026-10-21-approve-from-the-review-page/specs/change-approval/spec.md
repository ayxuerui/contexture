## Purpose

Lets a person who owns a store's content approve, or ask for changes to, a session's change from a page served
by `ctxr serve`, without a forge account. The decision is recorded on the forge, attributed to that person's
verified identity, so that the landing path can act on it.

## ADDED Requirements

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
