## Why

contexture can now produce three kinds of readable output — retrievable notes, derived documents (the
catalog, the graph's human-readable render), and, since `publish-artifact-skill`, hand-authored
published pages — but the only way to read any of them is opening files in an editor. Wikilinks make
this worse than a plain-markdown viewer would: `[[Target]]` is inert text everywhere except inside
`ctxr graph build`'s own resolution, so the store's most distinctive structure — the graph a note
actually sits in — is invisible while reading it.

`publish-artifact-skill`'s own proposal named this gap and deferred it on purpose:

> **Serving published pages or notes over HTTP.** Contexture has no server surface today; adding one is
> a distinct capability with its own security posture (which requester sees what) that deserves its own
> proposal, and should build on a filtered per-requester materialization rather than gating a live
> directory per request, once that materialization exists.

That materialization (`context-projection`, proposed in `isolation-and-egress`) does not exist yet, and
depends on a breaking schema change (`separate-scope-and-name-the-axes`) that has not landed either.
This proposal does not wait on either: it scopes the security posture down to "the operator reading
their own store on their own machine" instead of "a networked requester," which needs no per-requester
filtering at all. A later networked, requester-scoped mode is real future work and stays out of this
change on purpose (see Non-goals).

## What Changes

- Add a **`ctxr serve`** command: an HTTP server bound to loopback only, read-only, rendering notes,
  catalog sections, the graph document, and published pages for a human in a browser.
- Add a **context-browsing** capability: how store content is addressed, rendered, and linked for
  browsing — independent of retrieval (which answers "what exists / what connects to what" for an
  agent) and of publish (which produces a page meant to leave the store).
- Add `markdown-it` as a runtime dependency — the render step contexture has shipped none of, in any of
  the three prior artifact-producing changes.
- Extend `cli-contract`: a requirement stating explicitly that a long-running command emits its
  `--json` envelope once, before blocking to serve, rather than treating "runs forever" as an unstated
  exception to the one-JSON-value-on-stdout contract every other command already follows.

## Non-goals

- **Per-requester filtering (`--as` / `--audience`).** The security posture here is the loopback
  interface plus the operator's own machine login, not a permission decision made per request. A server
  meant to answer a *named requester* should be handed a pre-filtered materialization —
  `context-projection` — rather than re-deriving "may this requester see this note" on every route, for
  the same reason `context-visibility`'s enforcement is a pre-filter and not a post-filter. That
  materialization doesn't exist yet; this change does not build a shadow version of it under a
  different name.
- **Any write surface.** `ctxr serve` never accepts a mutating request. Editing the store stays with
  `write-lifecycle`'s session worktrees, on purpose — a browser tab is not a reviewed PR.
- **Search or ranked retrieval.** `context-retrieval` already holds that content matching is the
  agent's own leg, not a CLI command; a search box in the browser view would be exactly that command.
  `retrieval-legs-hardening` is separately where ranked retrieval is being designed, and this change
  does not front-run it.
- **Live reload, websockets, or any persistent connection.** Every route re-reads its source from disk
  per request, so a plain browser refresh always shows the current store; there is no push mechanism to
  design or secure.
- **MCP or any agent-facing protocol.** `context-browsing` renders HTML for a human's browser. An
  agent-facing retrieval protocol is a different consumer with a different contract and belongs to a
  separate change if it's ever built.
- **A shipped `ctxr-serve` skill.** Every other contexture-owned skill documents a decision procedure an
  agent follows during store work. Running a local dev server is an operator action taken outside any
  agent session; there is no decision procedure to hand an agent here.

## Capabilities

### New Capabilities

- `context-browsing`: how store content — notes, the catalog, the graph document, published pages — is
  addressed by URL, rendered to HTML, and cross-linked for a human reading it in a browser on the
  operator's own machine; and the loopback-only, read-only posture that makes per-requester filtering
  unnecessary for this capability specifically.

### Modified Capabilities

- `cli-contract`: the `--json` output envelope requirement gains an explicit carve-out for a
  long-running command, so `ctxr serve --json` emitting one envelope and then blocking is a documented
  case of the existing contract, not an unstated exception to it.

## Impact

Affected code: a new command (`src/commands/serve.ts`) wired into `src/run.ts`; a new render module
(`src/core/browse/render.ts`, markdown → HTML with a wikilink plugin resolving through the graph's
existing stem index) and a new route table module (`src/core/browse/routes.ts`) built from
`listNotes()`, `catalogSectionsFor()`, `graphDocumentPath()`, and `config.publish.path` — no new
enumeration logic, only a new consumer of the enumeration contexture already computes; a new dependency
(`markdown-it`) in `package.json`; new shipped templates (`templates/serve/{shell.html,style.css}`,
loaded the same deliberate way `hooks.ts` loads `.sh` templates rather than through
`packagedTemplate()`, which only ever strips one trailing newline from a `.md` file).

Affected stores: additive. A store that never runs `ctxr serve` is unaffected; no config key, schema
version, or existing command's behavior changes.

Depends on nothing unmerged. Explicitly does not depend on `isolation-and-egress` or
`separate-scope-and-name-the-axes` — see Why and Non-goals for the reasoning that decouples this change
from both.
