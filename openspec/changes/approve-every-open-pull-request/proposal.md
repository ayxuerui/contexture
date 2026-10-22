## Why

The approval page only shows pull requests whose session worktree exists in the checkout `ctxr serve` runs on.
Anything opened from another checkout cannot be approved from the page, and `ctxr land --pending` never lands
it, even when it is the same store's change on the same repository. That includes changes opened:
- by an engineer's laptop;
- by a second server, such as a test deployment of the MCP connector;
- by a session started on another host;
- by hand on GitHub.

The people who decide have no other place to decide, so every change to the store should reach them, whoever
opened it.

## What Changes

- **`/approve/` lists every open pull request** whose base is the store's default branch and whose head is a branch
  of the store's own repository, whether or not a session worktree for it exists locally. Each entry still gives
  the pull request number, head commit and decision state. The worktree name appears when there is one.
- **A change page is addressed by pull request number**, at `/approve/pull/<number>/`, with its decision route under
  it. The existing worktree-named address keeps working for reading: a `GET` redirects to the pull request's address,
  so links already in pull request bodies and connector replies stay valid. Decisions are posted only at the pull
  request's address.
- **Everything a page shows, and the head its decision submits, is the commit the forge reports,** never a branch
  name. When that commit is not yet in the repository, rendering may fetch exactly its branch from `origin` into the
  remote-tracking ref, only to obtain the objects, touching no worktree, local branch or index. That relaxes the rule that rendering fetches nothing. Published-page
  previews still need a session worktree, so such a page lists changed pages with their published addresses and
  says there is no preview.
- **`ctxr review list` and `ctxr land --pending` cover the same set:** every open pull request on the store's
  repository. Landing a pull request with no local worktree already uses a temporary worktree; it now also runs
  from the sweep.
- **Pull requests from forks stay out:** they are not listed, reported or swept. `land` must push its catch-up
  rebase to the pull request's branch, and it cannot push to someone else's repository. They remain on the forge.

## Non-goals

- **Approving a fork's pull request from the page.** It needs a landing path that never pushes to the head branch,
  which is a separate decision (design.md D3).
- **Previews for pull requests without a local worktree.** A preview is served from the worktree's files.
  Materialising a worktree for every open pull request would put agents' and strangers' branches on the server's
  disk unasked.
- **Changing who may decide, or how a decision is recorded.**

## Capabilities

### Modified Capabilities
- `change-approval`: the index, the change page and its address, the decision route's path, and `review list`
  cover every open pull request on the store's repository. Rendering may fetch the one branch a page needs.
- `write-lifecycle`: `ctxr land --pending` lands every approved open pull request on the store's repository, not
  only those with a local session worktree.

## Impact

- `src/core/browse/approve.ts` (index, locate, routes), `src/core/approval/sessions.ts` (the set of pull requests),
  `src/commands/review-list.ts`, and the `--pending` selection in `src/commands/land.ts`.
- The fake `gh` reports each pull request's head repository, so fork filtering can be tested.
- The README's approval section. The MCP connector's approval links keep working through the redirect.
