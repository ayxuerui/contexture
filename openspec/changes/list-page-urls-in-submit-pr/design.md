## Context

`pageServedAt(store, file)` already yields, for one page file, the area (preview or publish), the route, the
absolute URL if `serve.base_url` is set, and the after-landing address. It decides preview-versus-publish from
whether the resolved store root is a session worktree. `ctxr-submit` runs inside that worktree, so the same
function answers correctly for every page in the change set. What is missing is (a) a change-set enumeration,
(b) the move case, and (c) a place for the skill to read it.

## Goals / Non-Goals

**Goals:** the skill never derives a URL; moves and removals are reported; a store with no base URL gets
honest bare routes. **Non-goals:** see `proposal.md`.

## Decisions

**D1 — A new subcommand `publish urls`, not a field on `doctor --json` or `session`.**
*For the field:* `doctor` already runs in submit step 5, so no new call. *Against:* doctor is a validator with
a pass/fail contract, and addresses are not a validation result; folding them in makes every doctor consumer
pay for, and parse around, a report they did not ask for. `publish` already owns the address vocabulary
(`new`, `check`). A subcommand is also usable by an operator outside submit.

**D2 — The change set comes from git with rename detection, selected by `--staged` or `--since <ref>`.**
Exactly one is required; neither or both is a usage error. Pages are identified by `index.html` under
`publish.path`, since pages are the unit and the route addresses the file. The address of a page is the
address of its `index.html`, as `publish new` reports. Statuses: `added`, `modified`, `moved` (carrying the old
path and the old published address), `removed` (published address only, flagged as ceasing to work; no
preview). Submit uses `--since origin/<default>` after its step 1 fetch, because step 8 runs after the commit
in step 6 and nothing is staged by then. `--staged` is for use before committing.

**D3 — Preview versus published is per page, from the same function.** In a worktree each added or modified
page reports both addresses, labelled with when each works; outside a worktree only the published address,
matching the existing "no second address" rule. A moved page's new address is reported like an added one.

**D4 — No `serve.base_url`: bare routes, and the report says so** in one line, as `publish check` does.
Never guess a host.

**D5 — `serve.previews: local | none`, optional, no shipped default.** The key is a store fact the tool cannot
discover (the issue's cross-container case). `none` drops the preview from the report; absent or `local` is
today's behaviour. Being opt-in it is `.optional()` with no `SHIPPED_DEFAULTS` entry, and `ServeSchema` is
already optional as a block. *Against adding it:* a store can just edit the PR body. But a store where
previews never work would have every PR carry a dead column, so the cost of the key is one enum.

**D6 — The reachability caveat is skill prose, not command output.** The command emits facts; what the
reviewer should be told about them is a submit decision, kept in `templates/skills/ctxr-submit.md`. The
caveat names the condition: the preview resolves only while the PR is open and the server can see the
session's worktree; the published address resolves once the served checkout takes the landed commit.

**D7 — `--json` is the skill's interface;** default text is for humans. Shape: `{ base_url_declared, pages: [{
status, path, preview: {route,url}|null, published: {route,url}, moved_from: {path, published}|null }] }`.

## Risks / Trade-offs

A page filed outside `publish.path` is not a page and is omitted, consistent with `publish check`. A PR whose
base moved after open leaves the section stale; accepted, the table is written once.
