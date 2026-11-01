## Why

`ctxr serve` brings its clone of the store up to date only inside the landing sweep (`land-sweep-syncs-canonical-clone`), and the landing sweep runs only while the store declares `change_approval` with `land` absent or `auto`. A store without approval is served exactly as it was the day it was cloned: every merged note, page and configuration change stays invisible until someone fast-forwards the clone by hand. The family store hit this on 2026-10-23 and only stays current because change approval was turned on partly for this side effect. A store's served content should follow its default branch whether or not it approves changes through `serve`.

Previews have the opposite gap. A page written in a session inside a mounted store, such as a family page your own agent writes in pkm's mount of family-brain, lives in a worktree in your container. The store that will publish it never sees that worktree, so its preview link returns 404, and the other people who decide on it, who can read only that store's address, have nothing to open.

## What Changes

- **New `ctxr sync`**: brings the store's canonical clone up to date with the forge's default branch by the rule landing already uses (fast-forward only when the clone is on that branch, clean, and not diverged; otherwise left alone and reported). It authenticates as landing does, so in App mode it fetches as the App. It is useful on its own: an agent, a timer, or a person can run it.
- **`serve` keeps its clone current on a timer.** Every `serve.sync_minutes` minutes, `serve` runs one store-update run as a separate process: the landing run (`ctxr land --pending`, which already syncs) when the loaded configuration turns landing on, and `ctxr sync` otherwise. Runs never overlap. A run's output goes to stderr, prefixed, and no run affects how a request is answered.
- **Pull request previews from the pushed branch.** `serve` addresses each open pull request's pages under `/preview/pull/<number>/`, rendered from the pull request's head on the forge, fetched when the preview is opened (the head re-read at most every 15 seconds). A page previews at the address of the store that will publish it, whichever container wrote it.
- **A GitHub webhook.** With a webhook secret in its environment, `serve` accepts signed push deliveries at `POST /hooks/github`: a push to the default branch starts a store-update run at once, and a push to any other branch fetches it for its preview. A delivery is only a hint; every change is read from the forge. The timer and on-demand fetching stay as fallbacks, because GitHub does not retry a failed delivery.
- **`serve.sync_minutes`**: optional, positive whole minutes, absent meaning 5, today's landing interval. The landing sweep's interval follows it too, so one number decides how fresh a store is served.

## Non-goals

- **Updating agents' clones.** Agents keep their own clones current from their own containers (a timer running `ctxr sync` is the natural shape); the service holding the App key never writes into an agent's files. That belongs to the `contexture-images` work on the single host service.
- **Updating mounts.** `ctxr shared-stores sync` stays the way a store's mounts are refreshed; a store-update run does not touch `shared/`.
- **Resetting, stashing or forcing.** A clone with local work is left exactly as it was, as landing already does.
- **Pushing anything.** `ctxr sync` only fetches and fast-forwards.
- **The App-level webhook.** A GitHub App has one webhook URL for every repository it is installed on, which fits a single host service for all stores. Until that exists, each store's repository has its own webhook pointing at its own `serve`.
- **Previewing work that has not been pushed.** Before `ctxr session submit` pushes, a page exists only in its session worktree.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `write-lifecycle`: adds `ctxr sync`, the canonical-clone sync as a command of its own.
- `context-browsing`: `serve` runs a store-update run every `serve.sync_minutes` minutes, landing or syncing; previews open pull requests from their pushed branches; accepts signed GitHub push deliveries; the read-only-methods rule admits the webhook's `POST`.
- `change-approval`: the landing sweep's interval is `serve.sync_minutes` rather than a fixed five minutes.

## Impact

- New `src/commands/sync.ts`, sharing `core/git/fast-forward.ts` and landing's authenticated fetch.
- `src/core/approval/lander.ts` generalized into a store-update runner choosing `land --pending` or `sync`; `src/commands/serve.ts` always starts it.
- `src/config/schema.ts`: `serve.sync_minutes`.
- `src/core/browse/routes.ts`: `/preview/pull/<number>/` and `POST /hooks/github`; the webhook secret comes from `CONTEXTURE_WEBHOOK_SECRET` or `CONTEXTURE_WEBHOOK_SECRET_FILE`, never configuration.
- Deployment: per store, a repository webhook (push and pull request events) to `https://<store host>/hooks/github`, and a Cloudflare Access bypass for exactly `/hooks/github`.
- No migration: a store without the key gets the 5-minute default, and a store without `change_approval` starts getting synced.
