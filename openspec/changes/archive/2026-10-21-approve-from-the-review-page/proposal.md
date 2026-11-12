## Why

A store's changes land through a pull request, so the person who has to approve them has to use GitHub: find
the pull request, read a file diff, click Approve, then wait for an agent to catch the branch up, resolve
conflicts, merge and sync. The people who own a business store's content have no GitHub accounts and would not
understand one if they were given one. The approval they hold is real, but the tool they would have to use is
not theirs. `ctxr serve` already shows each session's knowledge changes, and it already runs behind Cloudflare
Access, which knows who the visitor is. What is missing is a way to approve from that page, and something that
does the rest once the approval is given.

## What Changes

- A new **approval page** on `ctxr serve`, at `/approve/<worktree>`, with an index at `/approve/` listing every
  session whose pull request is open. The page shows everything a decider can use. It shows the author's account
  of the change (the pull request's title and body, and every commit message), labelled as such. It shows what
  the review view shows, a rendered diff of every changed file in the store, and links to the preview and
  published address of every changed page. It ends with two plain HTML form buttons: **Approve** and
  **Request changes** (with a comment). It works with scripting disabled.
- The page exists only when the store opts in. A new optional `change_approval:` block names how to verify the
  visitor (the signed identity assertion the access proxy in front attaches, its issuer, audience and key set),
  who may decide (emails or `@domain` entries), and the forge login that records decisions. With no block,
  `/approve/` answers `404` and every non-read method stays `405`, exactly as today.
- A decision is recorded **on the forge**, as a pull-request review posted by the system's own GitHub identity.
  The review names the approver's verified email and the head commit they saw, in a human sentence and a
  machine-readable marker. Approve becomes an `APPROVE` review, so branch protection that requires a review is
  satisfied. Request changes becomes a `REQUEST_CHANGES` review that carries the comment. The pull request stays
  the audit trail; nobody needs a GitHub account to make an entry in it.
- An approval binds to the head commit shown on the page. A decision posted for a head that is no longer the
  branch's head is refused, and the page says the change moved on.
- A new deterministic command, **`ctxr land <pr>`**, carries out landing as code: read state, check consent,
  catch the branch up with a rebase onto the default branch, merge, confirm the forge reports merged,
  fast-forward the canonical clone, reclaim the worktree. Its consent is either a recorded approval for the head
  it merges, or `--confirm` from a caller that already has an explicit go. A clean rebase keeps the approval:
  the command checks that the rebased commits carry the same patches as the approved ones, and the system
  identity records that carry-over on the pull request. A rebase that conflicts does not keep it.
- **`ctxr land --pending`** lands every open session pull request whose current head carries an approval. It is
  one pass and exits, so a deployment can run it on a schedule. This is the "system does the rest" runner, and
  it runs headless.
- When the rebase conflicts and the store names a **conflict resolver** (a command to run, such as a headless
  agent CLI), `ctxr land` runs it in the session worktree, with the conflict playbook as its instructions. It
  then verifies that the result is clean, rebased and passing `ctxr doctor`, pushes it, and records on the pull
  request that the change needs re-approval. The approval page then shows the resolution for a new decision.
  An agent's merge of two sides is new text that nobody has read, so it never lands on the old approval.
- A new **`ctxr review list`** reports each open session pull request with its decision state: awaiting,
  approved, changes requested (with the comment), needs re-approval, or blocked. `ctxr-session-lifecycle` runs
  it at session start, so an interactive agent picks up requested changes and blocked landings.
- `ctxr-land` keeps its gate and becomes a thin skill over `ctxr land`. It asks for the operator's explicit go,
  then runs `ctxr land <pr> --confirm`, and it follows the conflict playbook itself when the command reports a
  conflict and no resolver is configured. `ctxr-submit`'s hand-off names the approval page address.

## Non-goals

- **Sign-in inside `ctxr serve` (OAuth or OIDC).** The deployment already has Cloudflare Access in front, and
  Access already authenticates the visitor and signs an assertion. Verifying that assertion is far less code and
  attack surface than running an OAuth client with sessions and secrets in serve. A store without such a proxy
  cannot use the approval page yet; built-in sign-in can be added later without changing the decision record.
- **Per-requester filtering of reads.** Any visitor the proxy lets in still sees every `context-browsing` route
  the same way. The approval page is the only identity-gated surface, and identity there decides who may
  *decide*, not what they may *read*.
- **Telling business users that something awaits them.** Notifications (email, chat) are separate work. For
  now the operator shares the `/approve/` address.
- **Landing without the forge.** A store with no reachable GitHub remote has nothing to record a decision on;
  the approval page reports that and offers no buttons.
- **Supervising the scheduled runner.** contexture ships `ctxr land --pending`. Running it on a schedule, and
  giving it and serve their credentials, is the deployment's job (contexture-images).

## Capabilities

### New Capabilities
- `change-approval`: deciding on a session's change outside the forge. Covers the verified identity of the
  visitor, who may decide, the approval page and its diff, how a decision is recorded on the forge, and the
  review-state listing agents read.

### Modified Capabilities
- `context-browsing`: the read-only-methods requirement admits `POST` to the decision route when (and only when)
  `change_approval` is configured. The no-filtering scenario is scoped to this capability's own routes.
- `write-lifecycle`: adds landing as a command. It merges only a head that carries consent, keeps an approval
  across a rebase only when the patches are unchanged, runs a configured conflict resolver, and routes a
  resolved conflict back to re-approval.
- `harness-portability`: `ctxr-land` drives `ctxr land` instead of sequencing `gh pr merge` and git by hand.
  `ctxr-submit` names the approval page in its hand-off. `ctxr-session-lifecycle` reads `ctxr review list` at
  start.

## Impact

- New commands: `src/commands/land.ts`, `src/commands/review-list.ts`. New core: forge reads and writes through
  `gh api` (pull request, reviews, merge), access-assertion verification (JWT signature, issuer, audience,
  expiry against a fetched key set), the decision marker format, and patch-equivalence of two commit ranges.
- `src/commands/serve.ts`: the `/approve/` routes, `POST` handling for the decision route only, and the
  per-file diff renderer. `templates/serve/` gains the approval page's markup and copy (shipped prose lives
  in templates).
- Config: a new optional `change_approval:` block with no shipped default (opt-in). It requires
  `serve.base_url`, because the decision route checks the request's `Origin` against it.
- Skills: `templates/skills/ctxr-land.md`, `ctxr-submit.md`, `ctxr-session-lifecycle.md`, and their tests in
  `test/unit/skills.test.ts`.
- Partly reverses `session-keeps-only-what-git-cannot-do` (PR #31): landing returns as a command, because the
  runner that acts on a page approval has no agent in it. `design.md` D1 gives the case against.
- Deployment (contexture-images, follow-up and not part of this change): serve's environment gets the approval
  identity's token. A scheduled `ctxr land --pending` gets a token with push and merge rights, plus the resolver
  CLI. Branch protection must not dismiss approvals on push, or the carry-over must be re-recorded (see design
  D5).
