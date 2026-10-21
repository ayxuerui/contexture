## Context

The motivation is in proposal.md (Why). The current state that shapes the approach:

- `ctxr serve` answers only `GET`/`HEAD` (`src/commands/serve.ts:119`) and has no notion of a requester. In the
  deployments that matter it sits behind Cloudflare Access, which authenticates each visitor and attaches a
  signed assertion (`Cf-Access-Jwt-Assertion`) to every request it forwards.
- `/review/<worktree>` already renders a session's knowledge delta from git trees, with no fetch and no write.
  On purpose it shows no note body, and no text an agent wrote about the change.
- Landing is a skill: `ctxr-land` runs `gh pr view`, gates on the operator's go, runs `gh pr merge`,
  fast-forwards the canonical clone, and reclaims the worktree. `session-keeps-only-what-git-cannot-do`
  (PR #31) removed `ctxr session land`, the forge adapter, and every `ctxr` command that performs a destructive
  git operation.
- The business users who should approve have no GitHub accounts. A deployment can give the system a GitHub
  identity, and headless runs are acceptable.

## Goals / Non-Goals

**Goals:**
- A business user approves or requests changes from a page, with no GitHub account and no conflict to
  resolve.
- After an approval, nobody has to do anything for a change to land unless an agent's conflict resolution
  needs a fresh look.
- The pull request stays the audit trail, and branch protection keeps its meaning.
- Every consent check is enforced by code, not by an instruction an agent follows.

**Non-Goals** (design-level, in addition to proposal.md's):
- A second forge. The forge code is GitHub through `gh`, the same as `ctxr-submit` today.
- Changing how `/review/` behaves, or what anonymous readers can see.

## Decisions

### D1. Landing is a command again

The runner that acts on a page approval has no agent in it. So the merge sequence (read state, check consent,
catch up, merge, confirm, sync, reclaim) has to exist somewhere other than a skill. `ctxr land` holds it, and
`ctxr-land` becomes the operator's interactive way to run it.

*The case against, steelmanned.* PR #31 removed exactly this surface, and its reasons still apply. The old
`session land` was a state machine around `gh` and git, tested against mocks, and duplicated what an agent
could do with the same two tools. A headless agent could follow today's `ctxr-land` skill (for example
`claude -p "land PR 7"`) with zero new code, and it would handle conflicts in the same run. That is a real
option, and the cheapest one to build.

*Why not.* This project's own rule is that a requirement claiming enforcement must name a mechanism, never "the
agent is told to". In this flow, the consent check is the one thing that has to be enforced: merge only a head
a named person approved, or one a clean rebase carried over from it. An LLM on that path makes the check a
matter of instruction-following, and it adds a model call, with its cost and variance, to every approval. The
#31 objection is about duplicating git for an agent that is present. Here none is present. The command stays
narrow: it never resolves content, and it does no destructive git beyond a leased push of a rebase and removing
a merged worktree, the same operations the skill already runs.

### D2. Identity comes from the access proxy's signed assertion, not from sign-in in serve

The server verifies the JWT that the proxy forwards in a configured header: the signature against the
configured key set (fetched, then cached by key id), and the issuer, audience, expiry and email claim. These
are generic OIDC-style parameters, so the same code works behind Cloudflare Access, Google IAP or
oauth2-proxy.

*The case for OAuth in serve.* It works without a proxy, it puts the store in charge of sign-in, and the
operator said it could be added. *Why not now.* Sign-in in serve means a client secret, a callback route,
session cookies, logout, and CSRF on the login flow. That is all new attack surface on a server that has never
held a secret, and it duplicates what Access already does in front of the only deployments that need this.
Verifying the assertion is a few dozen lines and fails closed: no header means `401`. A request that reaches
the bound port directly, without passing through Access, carries no valid assertion. If a deployment without a
proxy needs this, sign-in can be added as a second identity source, and the decision record (D3) does not
change.

### D3. The forge review is both the record and the channel

A decision becomes a pull-request review by the recording login. Its body carries a human sentence and a marker:

```
Approved by a@example.com on the review page, for commit 1a2b3c4.
<!-- ctxr-decision v1 decision=approve head=<40-hex> by=a@example.com at=2026-10-15T09:12:00Z -->
```

`ctxr land` and `ctxr review list` read decisions back from the forge and from nowhere else.

*Alternative: a local decisions file* in the store's cache, written by serve and read by the runner. It would
be faster to read and would work with the forge down. Rejected: the forge write has to happen anyway for the
audit trail and branch protection, and two stores of the same fact will eventually disagree. It also assumes
serve and the runner share a disk. The forge record works across containers and hosts, and survives either one
being rebuilt.

Only reviews by the recording login count (change-approval spec). Anyone with write access can post a review
containing the marker under their own account, and it is ignored. The landing state (`blocked` with a reason)
is a pull-request comment by the same login, with a `ctxr-land` marker, and the latest one wins.

### D4. One system identity records decisions and lands; it is not the PR author

GitHub refuses an approving review from the pull request's author. Agents open pull requests with their own
`gh` credential, so the recording identity has to be a different one. A GitHub App or a dedicated bot account
both work. That identity is configured as `change_approval.recording_login`. Serve holds its token to post
reviews. The `ctxr land --pending` runner holds a token for the same identity, with push and merge rights, so
that its carry-over reviews and landing comments count as records. serve refuses to start when its credential
is not the recording login (fail loud, spec).

Interactive `ctxr land <pr> --confirm` may run with the agent's own credential. It still merges, but it cannot
post records under the recording login, so it reports a carry-over or a block in its envelope only. It does not
need to record a carry-over, because its consent is `--confirm`, not a recorded approval.

### D5. Carry-over is decided by patch identity, and recorded as a fresh approval

After a clean rebase, `git patch-id --stable` over each commit of the approved range and of the rebased range
must match one for one. That is the mechanical meaning of "the same change, applied to a newer base". When they
match, the runner posts an approving review naming both heads:

```
Carried over from 1a2b3c4 to 5d6e7f8 by a clean rebase onto main (patches unchanged). Approved by a@example.com.
<!-- ctxr-decision v1 decision=approve head=<h2> by=a@example.com at=<original time> carried-from=<h1> -->
```

This also defuses GitHub's "dismiss stale approvals when new commits are pushed" setting. The rebase push
dismisses the bot's earlier review, and the carry-over review is a fresh one on the new head. Each carry-over
names the original decider and time. `ctxr review list` follows the `carried-from` chain back to the decision a
person made.

*Alternative: compare the knowledge delta* from `ctxr graph diff`. Rejected: that delta ignores body text, so
it would let changed prose through as "unchanged".

### D6. A resolved conflict goes back to a person (the operator's choice)

The resolver is a configured argument vector, for example `["claude", "-p"]`. It is run with the conflict
playbook as its prompt, and `CTXR_LAND_PR`, `CTXR_LAND_BASE` and the worktree as its working directory. `ctxr
land` then checks the result: rebase finished, worktree clean, branch contains the base, and `ctxr doctor`
passes. It pushes with a lease and comments that the change needs re-approval. The approval page shows the
resolved diff, and the business user clicks once more.

*The case for letting the approval carry.* The user asked for nobody to deal with conflicts, and re-approval is
one more click per conflict. *Why not.* The resolution is new text, the agent's blend of two sides, that no
person has read, and approval is supposed to mean "a person read what lands". The business user still never
resolves anything. They only approve the result. This was put to the operator, who chose re-approval.

### D7. The runner is a scheduled one-pass command, not something serve spawns

`ctxr land --pending` reads the forge, lands what is approved, records what is blocked, and exits. The
deployment runs it on a schedule; contexture-images already has `lib/schedule.sh`.

*The case for serve spawning `ctxr land` right after an approval.* It lands within seconds, and there is no
scheduler to operate. *Why not.* serve would then need push and merge credentials, write access to the
canonical clone and the worktrees, and supervision of child processes. That turns a read surface into the
store's writer. With a schedule, serve holds a review-only job and writes nothing under the store root (spec).
The cost is latency up to the schedule interval, which is acceptable for a decision that took a person minutes.
The page says "approved, landing shortly", which is honest about that.

### D8. A separate `/approve/` route, not new behaviour on `/review/`

The approval page must show note bodies, as a diff, because a person cannot approve text they cannot read.
`/review/`'s contract is that it shows none, and it is anonymous within `context-browsing`. Instead of adding a
requester concept to that capability, `/approve/` lives in `change-approval`. It renders the same delta facts
by reusing the review renderer, adds the per-file diff, and sits behind D2. `context-browsing` changes only to
admit the one `POST` and to scope its no-filtering claim to its own routes.

The approval page shows everything a decider can use, including the author's own account: the pull request's
title and body (the what and the why), and every commit message. `/review/` keeps its rule of reading no
agent-authored text, because its job is to check the agent's account against a record the agent did not write.
The approval page's job is a decision, and a business user cannot decide well without knowing what the change
is for. So the author's account is on the page, in a section labelled as the author's, and it is never mixed
into the derived facts. Because the derived facts and the diff sit beside it, the reader can still check one
against the other. The page also links the preview of every changed page, as `ctxr publish urls` reports
them, so a decider can see a page as it will look before approving.

### D9. CSRF: Origin check plus head binding, no secret

The decision form is a plain HTML `POST`, so the page works without script. The route requires
`Origin == origin(serve.base_url)`, which is why `serve.base_url` becomes mandatory with `change_approval`. The
form also carries the head it was rendered for. A forged cross-site post fails the Origin check. A replayed
post for an old head fails the head check against the forge. A per-form HMAC token was considered and rejected:
it needs a server secret, and it adds nothing over these two checks for a same-origin, identity-gated form.

### D10. Forge access through `gh api`, as core code, not an adapter kind

The forge code is `src/core/forge/github.ts`: one `execFile('gh', ['api', ...])` runner, the same exec pattern
as `src/core/git/exec.ts`, covering pull request by head branch, reviews, review create, comment create, merge,
and the authenticated login. It is deliberately not a revived `forge` adapter kind (#31 removed that, because
there is no second forge). `gh` reads `GH_TOKEN` from the process environment, so serve and the runner get
different credentials through their environments, and no token is ever written into config.

### D11. Config shape

```yaml
serve:
  base_url: https://ctx.example.com
change_approval:            # optional, no shipped default
  identity:
    header: Cf-Access-Jwt-Assertion
    issuer: https://ctx-a.cloudflareaccess.com
    audience: <application aud tag>
    jwks_url: https://ctx-a.cloudflareaccess.com/cdn-cgi/access/certs
  deciders: ["@example.com", "ops@ctx-a.example"]
  recording_login: ctx-approvals[bot]
  resolver: ["claude", "-p"]   # optional; absent means a conflict blocks
  merge_method: squash          # optional; squash when absent, matching ctxr-land today
```

## Risks / Trade-offs

- [serve now holds a forge write credential] → The credential is the review-only recording identity, scoped
  by the deployment (a GitHub App with pull-requests write on this one repository). The only `POST` route is
  identity-gated and Origin-checked, and serve refuses to start when its login is unexpected.
- [The key-set fetch fails or the issuer rotates keys] → Cache keys by `kid` and re-fetch on an unknown
  `kid`. A failed fetch fails closed with `401`, never open.
- [The bound port is reachable around the proxy] → No assertion means `401`, by D2. Only the anonymous
  `context-browsing` routes stay reachable, exactly as today.
- [A runner tick lands something the decider wanted to take back] → Request changes after approval is the
  latest decision, and `--pending` reads the latest decision immediately before each merge. The window is
  the time between that read and the merge call.
- [Patch-id equality accepts a rebase that is semantically different, because main changed the context
  around an unchanged hunk] → This is the same risk as any clean rebase or merge on the forge today, and
  `ctxr doctor` still gates the merged tree through the pre-commit hook on the next session. It is accepted
  and named.
- [The resolver is an arbitrary command run headless] → It is opt-in with no default, its result is accepted
  only after mechanical checks, and its output never lands without a person's re-approval.
- [The author's account misdescribes the change] → It is labelled as the author's, and it sits beside the
  knowledge-change facts and the diff, which are computed from the commits, so a mismatch is visible on the
  same page.
- [Markup in a pull request body or commit message runs script on the page] → Raw HTML is escaped and never
  rendered (spec). The markdown renderer is configured so it does not pass HTML through.
- [Reintroducing a landing command reverses part of #31] → Kept narrow, by D1. The tests run against a real
  temporary git repository and a stubbed `gh` on `PATH`, not against a mocked state machine, so they exercise
  the commands a user would run.

## Migration Plan

This is additive and opt-in: a store without `change_approval` sees no change except the `ctxr-land` skill
now calling `ctxr land --confirm`. Rollout follows the release (trial by release). To enable it in a
deployment:

1. Create the recording identity and give it access to the store repository.
2. Add `change_approval` and `serve.base_url` to the store's `contexture.yaml`.
3. In contexture-images, give serve's environment the recording token, add a scheduled
   `ctxr land --pending` with the same identity's push and merge token, and optionally install the resolver
   CLI.
4. In branch protection, require one approving review. Leave "dismiss stale approvals" either way (D5).

To roll back, remove the `change_approval` block: the routes go `404`, and the runner finds no decisions to act
on.

## Open Questions

- The schedule interval for `--pending` belongs to the deployment and is not set by contexture.
