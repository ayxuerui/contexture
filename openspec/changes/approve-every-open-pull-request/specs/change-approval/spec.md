## MODIFIED Requirements

### Requirement: The approval index lists every session awaiting a decision
`GET /approve/` SHALL list every open pull request on the forge whose base is the configured default branch and
whose head branch is in the store's own repository, whether or not a session worktree for it exists in the
checkout `ctxr serve` runs on. Each entry SHALL give the pull request number linked to its approval page, the
head commit, the decision state as `ctxr review list` reports it, and the session worktree's name when one
exists. A pull request whose head is in another repository (a fork) SHALL NOT be listed, and neither SHALL a
session worktree with no open pull request. When the forge cannot be reached, the index SHALL say
so and SHALL offer no decision.

#### Scenario: An open pull request is listed with its state
- **WHEN** worktree `work-ctx-a` has an open pull request with no decision, and worktree `work-ctx-b` has no
  pull request
- **THEN** `/approve/` lists `work-ctx-a` as awaiting a decision with its pull request number and head commit,
  and does not list `work-ctx-b`

#### Scenario: A pull request opened from another checkout is listed
- **WHEN** pull request 12 is open against the default branch from a branch of the store's repository, and no
  session worktree for it exists locally
- **THEN** `/approve/` lists pull request 12 with its head commit and decision state, linked to
  `/approve/pull/12/`

#### Scenario: A fork's pull request is not listed
- **WHEN** pull request 13 is open against the default branch from a branch in another repository
- **THEN** `/approve/` does not list it

### Requirement: The approval page shows the change itself
`GET /approve/pull/<number>/` SHALL render, for any pull request the approval index lists, through the same shell
as every other HTML route: every fact the review route shows for its session worktree, when one exists; for each file under the store root that differs between the base and the head
the review route compares (derived cache paths excluded), the file's path and its changes as removed and added
lines; the pull request number; the full head commit id; and the current decision state.

The page SHALL also show the author's account of the change: the pull request's title, its body rendered as
markdown, and the full message of every commit in the compared range. These SHALL appear in a section of their
own, labelled as the author's account, and SHALL NOT be interleaved with the derived facts or the diff. Raw
HTML in the body or a commit message SHALL be shown as escaped text and never rendered as markup.

For every page under the publish path that the compared range adds, modifies, moves or removes, as
`ctxr publish urls` reports it, the page SHALL show the page's status and link its preview and published
addresses, stating for each address when it resolves.

When no session worktree exists, the page SHALL list each changed page with its published address and state that
no preview is available.

Its content SHALL be readable, and its decision controls usable, with client-side scripting disabled. Rendering
the page SHALL NOT check out or write anything in any worktree, local branch or index. Every part of the page,
diff, commit messages and knowledge changes, SHALL be computed from the pull request's head commit id as the forge
reports it, and the same id SHALL be the head the decision form submits; no part SHALL be computed from a branch
name. When that commit is not in the repository, rendering MAY fetch exactly the head branch from `origin` into its
remote-tracking ref, and nothing else. When the commit is still absent afterwards, the page SHALL say so and SHALL
offer no decision.

`GET /approve/pull/<number>/` SHALL answer the landed page described below once the pull request has merged, and
`404` for a number the approval index would not list.

The diff on the page SHALL be computed from the committed head. Uncommitted work in a worktree SHALL NOT
appear on the page.

`GET /approve/<worktree>` SHALL answer a redirect to its pull request's address when the worktree's branch has an
open pull request, and the landed page described below when it has merged.

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

#### Scenario: A pull request with no local worktree shows its change
- **WHEN** `/approve/pull/12/` is requested for an open pull request whose head commit is not in the repository and
  for which no session worktree exists
- **THEN** the head branch is fetched into its remote-tracking ref, the page shows every changed file's removed and
  added lines and the author's account, and no worktree, local branch or index has changed

#### Scenario: A stale remote-tracking ref cannot change what is shown
- **WHEN** the forge reports pull request 12's head as `h2`, while `refs/remotes/origin/<head>` still points at an
  earlier `h1`
- **THEN** the page shows the change at `h2`, and its decision form submits `h2`

#### Scenario: A draft is shown but cannot be decided
- **WHEN** pull request 14 is open and marked as a draft on the forge
- **THEN** the index lists it labelled as a draft, and its page offers no decision control

#### Scenario: A merged pull request without a worktree shows the landed page
- **WHEN** `/approve/pull/12/` is requested after `ctxr land` merged pull request 12, which never had a session
  worktree
- **THEN** the response is `200`, stating that the change landed, with the merged commit id

#### Scenario: A worktree address redirects to its pull request
- **WHEN** `/approve/<worktree>/` is requested for a worktree whose branch has open pull request 7
- **THEN** the response redirects to `/approve/pull/7/`

### Requirement: A decision is accepted only for the head the decider saw
`POST /approve/pull/<number>/decision` SHALL be the only approval route that admits `POST`. A pull request marked
as a draft on the forge SHALL be offered no decision, and a decision posted for one SHALL be refused. It SHALL require: a verified
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

### Requirement: The review state of every open session pull request is reported
`ctxr review list` SHALL report every pull request the approval index lists. It SHALL give the pull request
number, the session worktree's name or none, the head commit, the decision state, and for a decision the decider
and time. A changes-requested state
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

#### Scenario: A pull request with no local worktree is reported
- **WHEN** pull request 12 is open from a branch of the store's repository with no local session worktree, and a
  decider approved its head
- **THEN** `ctxr review list --json` reports pull request 12 as `approved`, with no worktree
