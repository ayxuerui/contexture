## Context

See proposal.md, Why. Today four readers derive "what awaits a decision" from the session worktrees on disk:
- the index and change page (`browse/approve.ts`, `locate`);
- `sessionPulls` (`approval/sessions.ts`);
- `ctxr review list`;
- `ctxr land --pending`.

Each matches a worktree's branch to an open pull request. A pull request with no local worktree is invisible to
all four, even though `ctxr land <pr>` already lands one by number, through a temporary worktree
(`checkoutFor`).

## Goals / Non-Goals

**Goals:** one set, every open pull request on the store's own repository against its default branch, shown,
reported and landed alike, without breaking addresses already handed out.

**Non-Goals:** see proposal.md.

## Decisions

### D1. The set is every open pull request on the store's repository, against the default branch

A pull request is in the set when it is open, its base is `git.default_branch`, and its head repository is the
base repository. "Session" stops being the criterion, because how a change was opened says nothing about whether
someone should decide on it.

**The case for keeping session worktrees as the criterion:**
- the page could only ever show code the server already holds;
- a branch nobody meant for the store never appears.

It loses because the forge, not the disk, is where a change asks to be merged. The base filter (the default
branch) and the repository filter (no forks) already exclude what is not a change to this store.

### D2. Address by pull request number; worktree names redirect

The canonical address is `/approve/pull/<number>/`, and the decision route is `/approve/pull/<number>/decision`.
A worktree-named address answers a `GET` with a `302` to its pull request's address, or with the existing
"landed" page when its pull request has merged. A decision `POST` is accepted only at the pull request's address.
A tab rendered before this change reloads through the redirect, and the decider clicks again; keeping a second
decision path for that one-off case is not worth it (round one's pragmatist).

`/approve/pull/<n>/` answers the landed page once the pull request has merged. The landing record is keyed by pull
request number, with the worktree name kept when there was one, so a pull request that never had a worktree still
has a landed page. A number outside the set (a fork, a closed pull request, another base) gets `404`. A worktree-named address
whose branch has no open pull request and no landing record keeps today's answer, the page saying the session has
no pull request.

**Records under both names.** `land` writes each record to `pull-<n>.json`, and also to `<worktree>.json` when there
was a worktree, exactly as today. A worktree-named address finds its landed page with no new lookup. A record
written before this change, which exists only under its worktree name, is found by number by scanning the records'
`pull_request` field. The directory holds one small file per landing, so the scan is cheap and needs no migration
(round two's architect).

**The case for a single scheme by worktree name, with a generated name for pull requests that have none:** fewer
routes. It loses because the number is the one name every opener shares; a generated name would be a second
identity for the same change.

`pull` is a path segment no worktree directory can take: worktree names carry the session prefix's dashes and a
timestamp. So the two schemes cannot collide.

### D3. Forks stay out

A fork's pull request can be approved on the forge itself, but `land` cannot carry it. A behind branch is rebased
and pushed with a lease to the pull request's head branch, and that branch lives in a repository the store's
credential cannot write.

**The case for listing forks anyway, read-only:** deciders see everything. It loses because an Approve button that
can never land is the failure `serve-lands-approved-changes` exists to prevent. A fork-aware landing that merges
without rebasing is its own change.

### D4. Rendering may fetch exactly the head it shows

**Everything the page shows is computed from the pull request's head commit id as the forge reports it, never
from a branch name.** That covers the diff, the commit messages and the knowledge changes, and the same id goes into
the decision form. A remote-tracking ref can be stale, or move mid-request, so a page computed from one could show
a decider one change while they approve another. The skeptic's veto in round one found this.

The remote-tracking ref is used only to obtain objects. When the head commit is not in the repository, rendering
runs `git fetch origin +refs/heads/<head>:refs/remotes/origin/<head>`, through the forge credential as landing
does, then checks that the reported commit now exists. If it does not (the branch moved during the fetch), the page
renders with a notice and no decision control. Nothing else is fetched. No worktree, local branch
or index changes. A fetch that fails renders the page with a notice and no Approve button.

The rule being relaxed exists so that a page view has no side effects a person must reason about. A
remote-tracking ref moving to the forge's truth is not one: `land`'s own sweep makes the same fetch every five
minutes.

**The case for not fetching on `GET`:** a page view stays cheap and offline. It loses for pull requests opened
elsewhere, which would otherwise show nothing until the next sweep, or nothing at all if the sweep found nothing
to land.

### D5. `review list` and `land --pending` share the set

`sessionPulls` becomes `storePulls`, in a module renamed `approval/pulls.ts`, so the names stop saying
"session" where any pull request is meant. It takes the open pull requests from the forge and filters them by D1. Each
pull request is paired with its local session worktree when one exists, so the worktree name and its review route
still appear. `review list` reports each one, with `worktree: null` when there is none. `land --pending` lands
each approved one; with no worktree, `checkoutFor` already supplies a temporary one. After the merge, a pull
request without a worktree has nothing to reclaim, and the record says so.

## Risks / Trade-offs

- **[A draft pull request]** → It is listed, labelled "draft", with no decision control, and `land --pending` skips
  it. The forge refuses to merge a draft, so an Approve on one could never land (round one's architect). It becomes
  decidable once the forge marks it ready.
- **[A fetch on page view against a slow forge]** → It is bounded to the one branch, with a timeout. On failure the
  page renders without a decision control.
- **[Existing links]** → Worktree-named addresses keep working through D2's redirect, and their landed pages through
  the worktree-named record.

## Migration Plan

None: addresses that existed keep working, records already written are read as they are (D2), and the set only
grows. To roll back, revert the change. Pull requests
opened elsewhere go back to being invisible to the page.

## Revisions after critique

A first three-model round (2026-10-22) ended in a veto; all findings are folded in.

1. **Everything shown and decided is bound to the forge-reported head commit id** (skeptic, veto). See D4.
2. **Drafts are listed, but cannot be decided or swept** (architect). See Risks.
3. **`/approve/pull/<n>/` has a landed page and a `404`, and landing records are keyed by number** (architect). See
   D2.
4. **The set's module is renamed `approval/pulls.ts`** (architect). The two requirement titles keep the word
   "session", because renaming them would mean replacing them; their text now says what they cover.
5. **A single decision route**, at the pull request's address (pragmatist). See D2.

A second round (Fable and Gemini; Codex failed to run) approved with changes. Folded in: the proposal and Risks no
longer describe a second decision route; landing records are written under both names, with a scan by number for
older ones; and the worktree address's third case (no pull request, no record) is stated (D2).
