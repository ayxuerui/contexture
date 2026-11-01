## Context

See proposal.md for why. The pieces already exist:

- `core/git/fast-forward.ts` holds the canonical-sync rule (on the default branch, clean, not diverged; otherwise
  report and leave alone), shared by `ctxr land` and `ctxr shared-stores sync`.
- `ctxr land` fetches through `remoteGit`, which authenticates as the GitHub App when App credentials are in the
  environment, and otherwise uses the git credential the host already has.
- `core/approval/lander.ts` runs `ctxr land --pending` as a child process: once 10 seconds after start, then every
  5 minutes, never two at once, output prefixed `land:` to stderr. `serve` starts it only while the loaded
  configuration declares `change_approval` with `land` absent or `auto`.
- Landing holds a lock in the repository's git directory, so a person's `ctxr land` and the server's sweep never race.

Two facts checked on the live host on 2026-11-01 shape the last two decisions:

- **`serve` and the agents share one clone.** In the runtime image's compose, a store's `serve` and agents containers
  mount the same volume at `/store`. So `serve`'s git commands run in a repository the agent can write, `.git/`
  included.
- **Agents can already merge to `main`.** pkm's agent logs in as the repository owner, and the other agents' tokens
  have write access. None of these private repositories has branch protection, which needs a paid GitHub plan. The
  approval page records consent and the hooks and skills enforce the habit, but nothing on the forge prevents a direct
  push. What the App key adds for a compromised agent is reach into stores its own token cannot write, and the ability
  to forge a decision attributed to a person.

## Goals / Non-Goals

**Goals:**
- Every running `serve` follows its store's default branch within one interval, approval or not.
- One number decides how fresh a store is served.
- No second scheduler, and no new way of authenticating.

**Non-Goals:** see the proposal's Non-goals.

## Decisions

### D1. The sync is a command, `ctxr sync`, run as a child like landing

**Case for syncing in-process inside `serve`:** no child process, and no new command to document. **Why a
command:** the runner already isolates landing in a child process, so a hung fetch or a crash never takes the server
down; the sync gets the same isolation for free. The command also stands on its own: an agents container's timer
(the `contexture-images` side of keeping agents current) or a person can run exactly what the server runs.

### D2. One timer runs one store-update run: landing when landing is on, sync otherwise

**Case for two timers** (the landing sweep as today, plus a separate sync timer): no change to the landing path.
**Why one:** two runs would fetch and fast-forward the same clone and could interleave with a merge. One run at a time
removes that, and landing already ends with the canonical sync, so it subsumes a sync run. `ctxr sync` also takes
landing's repository lock, so a person's `ctxr land` and a server's `ctxr sync` never race either.

### D3. `serve.sync_minutes` defaults to 5, on for every store

**Case for an opt-in key with no default** (the convention for mechanisms a store must choose): a store that never
asked starts fetching from the forge every five minutes. **Why a default:** serving a store as it was on the day it
was cloned is the bug, not a choice anyone makes, and every store that runs `serve` wants its content current. Five
is today's landing interval, so a store with approval sees no change, and a shipped default follows the release.

### D4. The command is named `ctxr sync`

**Case for `ctxr canonical sync` or `ctxr store sync`:** they say what is synced. **Why `ctxr sync`:** at the point
of use, in a terminal or a timer, it reads as "bring this store up to date", which is what it does. `ctxr
shared-stores sync` stays distinct by its group name.

### D5. The first run starts within a minute

The lander's first sweep runs 10 seconds after start today; the runner keeps that, and the spec says "within one
minute" so a slow start is not a violation.

### D6. Pull request previews are fetched when opened, at the publishing store's address

**Case for previewing at the writer's own store** (your agent's `serve`, which can reach the session worktree in your
container): no fetch at all. **Why the publishing store:** the other deciders can read only that store's address, a
preview must be byte-identical to what `/publish/` will serve, and a page's relative links resolve against the store
that publishes it. Previews are addressed by pull request number, which the approval pages and `ctxr session submit`
already report, rather than by branch name, which contains slashes and can be renamed.

### D7. A GitHub webhook, used only as a hint, with every other mechanism kept as fallback

**Case against a webhook** (the first draft held it off): a route that must be reachable without Access, a secret
to manage, and webhook settings per repository. **Why do it:** the route does nothing but start work `serve` already
does on its own timer, and it trusts nothing in the delivery beyond "branch X changed", reading every change from the
forge. A forged delivery that somehow passed the signature check costs one extra fetch. In return, merged pages are
served within seconds and previews are ready before the link is opened. The timer and on-demand fetching stay
because GitHub does not retry a failed delivery.

### D8. Per-repository webhooks now; the App's single webhook with the single host service

**Case for the App's webhook now:** one setting covers every store, and the App is already installed on all of them.
**Why per repository:** an App has one webhook URL, and today each store has its own `serve`, so one receiver would
have to forward to the others. Each repository's webhook points at its own `serve` until the stores share one host
service, which then takes the App's webhook.

### D9. The webhook secret lives in the environment, and Access is bypassed for exactly one path

The secret is read from `CONTEXTURE_WEBHOOK_SECRET` or `CONTEXTURE_WEBHOOK_SECRET_FILE`, like the App key, never from
`contexture.yaml`, which is committed. GitHub cannot pass Cloudflare Access, so each store's hostname gets an Access
bypass for exactly `/hooks/github`, the same shape as the existing `/mcp` bypass on `brain.ruixue.ai`; the signature
check is that route's control.

### D10. The agents' update loop is a ctxr command, never a process of `serve`

**Case for a subprocess of `serve`** (the owner's suggestion, to keep `contexture-images` simple): one place runs
every timer. **Why not:** updating a clone runs git inside it, and git runs that clone's hooks and configuration
(`post-merge`, `core.hooksPath`, `core.fsmonitor`), which the agent controls; a child of `serve` runs in the container
holding the App key, next to the key file. The simplicity is kept another way: the loop is `ctxr sync --every`, so
`contexture-images` adds one supervised line in the agents container, run as the agent's own user with its own token,
and `serve`'s timer calls the same sync code.

### D11. A failed fetch is reported, never compared against

The landing run's canonical sync fetches with failures allowed, then compares the clone with the last-fetched default
branch. When that fetch fails, an old `origin/main` equal to HEAD reads as "already current". The sync now checks the
fetch first and reports it, for landing and for `ctxr sync`. **Case for keeping failures quiet:** a forge outage then
produces no warning on every run. **Why report:** a store silently served stale while claiming to be current is the
failure this change exists to remove.

### D12. Landing's git ignores the repository's hooks and drivers, as defense in depth

Because `serve` shares `/store` with the agent, a hook or driver the agent places in `.git/` would run in the process
holding the App key on the next landing run. Every git command landing and syncing run overrides `core.hooksPath` with
an empty directory, turns `core.fsmonitor` off, and blanks each filter, diff and merge driver the repository declares.
**Case for skipping it and giving `serve` its own clone instead:** a separate volume removes the shared repository
altogether, and overrides cannot anticipate every configuration git might execute. **Why both:** the separate clone is
a `contexture-images` change that lands with the single host service; the overrides are cheap, protect every store
now, and stay useful after. They are not a guarantee, and the design does not claim one.

## Risks / Trade-offs

- **[A `serve` with no forge credential fails every run]** Without App credentials or a host credential, a private
  store's fetch fails each interval. → It fails loudly on stderr, prefixed, every interval; requests are unaffected.
  The `.docker` READMEs name the App as the credential `serve` uses.
- **[Network activity on every store]** One fetch per store per interval. → Five minutes is what landing stores
  already do; `serve.sync_minutes` can lengthen it.
- **[The Access bypass is widened by mistake]** A bypass broader than `/hooks/github` would expose the store. →
  The README names the exact path; a deploy check curls `/` and `/notes/` from outside and expects a redirect to Access.
- **[A clone with local work never updates]** → Reported on every run as the reason, exactly as landing does; nothing
  is forced.

## Migration Plan

None. Stores without the key get the 5-minute default, and stores without `change_approval` start being synced on
the next `serve` start after the release. Rollback is the previous release.
