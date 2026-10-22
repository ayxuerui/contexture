## 1. The set of pull requests

- [ ] 1.1 Replace `sessionPulls` with `storePulls`, moved to `src/core/approval/pulls.ts`: open pull requests whose base is the default branch and whose head repository is the base repository, each paired with its local session worktree when one exists; teach `ForgeClient`'s pull shape the head repository and draft flag, and the fake `gh` to report them
- [ ] 1.2 Tests: a pull request with no worktree is in the set, a fork's and one against another base are not, a worktree's pull request keeps its name; green under `npx vitest run test/unit/approval-sessions.test.ts`

## 2. The approval page

- [ ] 2.1 Route `/approve/pull/<number>/` and `/approve/pull/<number>/decision` in `src/core/browse/approve.ts`; redirect a worktree-named `GET` to its pull request's address (or the landed page); the landed page by number from `pull-<n>.json`, falling back to a scan of older worktree-named records; `404` for a number outside the set; a worktree with no pull request and no record keeps today's no-pull-request page; a worktree-named decision `POST` refused; no decision for a draft
- [ ] 2.2 Index lists `storePulls`, linking by number, showing the worktree name when there is one and a "draft" label for a forge draft
- [ ] 2.3 Every part of the change page computed from the forge-reported head commit id, which the decision form submits; without a worktree, fetch exactly the head branch into its remote-tracking ref through the forge credential when the head commit is absent, compute the diff from it, list changed pages with published addresses and "no preview"; on a failed fetch, a notice and no decision control
- [ ] 2.4 Tests through `ctxr serve` with the fake forge: a pull request opened from a second clone is listed, rendered and decided by number; a fork is not listed; a worktree address redirects; a worktree-named decision POST is refused; a stale remote-tracking ref still yields the forge head's diff and form; a branch moving during the fetch withholds the decision; a draft has no decision control; a merged worktree-less pull request shows the landed page; the canonical checkout's HEAD, index and branches are unchanged after rendering; green under `npx vitest run test/integration/serve-approve.test.ts`

## 3. Review list and landing

- [ ] 3.1 `ctxr review list` reports `storePulls`, with `worktree: null` when there is none
- [ ] 3.2 `ctxr land --pending` selects from `storePulls`, skipping drafts; landing a pull request with no worktree reports nothing to reclaim; landing records written to `pull-<n>.json` and, when there was a worktree, `<worktree>.json`
- [ ] 3.3 Tests: review list reports a worktree-less approved pull request; `--pending` lands it through a temporary worktree and leaves none behind; green under `npx vitest run test/integration/serve-lands.test.ts test/unit/review-list.test.ts`

## 4. Documentation and full suite

- [ ] 4.1 README approval section: every open pull request on the store's repository is listed, forks are not, and addresses are by pull request number
- [ ] 4.2 `npm run typecheck`, `npm run build` and `npm test` exit zero, and `openspec validate approve-every-open-pull-request --strict` passes
