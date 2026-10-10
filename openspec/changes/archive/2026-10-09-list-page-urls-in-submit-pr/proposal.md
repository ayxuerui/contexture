## Why

`ctxr publish new` and `ctxr publish check` name a page's preview address and the address it is served at once
it lands, absolute when `serve.base_url` is set (#112, #135). That address lives only in the agent's terminal.
When the session reaches `ctxr-submit`, nothing carries it into the pull request, so a reviewer sees
`index.html` as a few hundred lines of diff with no link to the rendered page, which is what a page's review
needs. The reviewer rebuilds the URL from a worktree directory name and a page path, the guessing #112 removed.
A page moved into a subject folder after its address was shared is recorded only as a file rename (#150).

## What Changes

- A new command, `ctxr publish urls`, reports the addresses of every page a change set adds, modifies, moves
  or removes. The change set is the staged changes (`--staged`) or everything since a base ref
  (`--since <ref>`). Per page it reports a status, the preview address, the published address, and for a move
  the old published address that stops working. Output is human-readable by default and `--json` for callers.
- `ctxr-submit` runs it before opening the pull request and, when it reports any page, puts a **Pages**
  section in the body: a table of those addresses labelled by when each one works, plus one line stating
  the condition under which a preview resolves. A change set touching no page adds nothing to the body.
- Addresses are absolute when `serve.base_url` is declared; otherwise bare routes, said to be bare.
- A new optional config key, `serve.previews` (`local` | `none`), lets a store whose previews never resolve
  for a reviewer drop the preview column. Absent, behaviour is the current one.

## Non-goals

- **Detecting whether a preview resolves.** The server and the session may be on different hosts and the CLI
  cannot know. The body states the condition instead of promising the link.
- **Rendering or fetching the page** (#120). This reports addresses; it does not look at the page.
- **Editing an existing pull request body** after a later push. The section is written once at open.
- **Changing `publish new` / `publish check` output.** They keep reporting one page's address.

## Capabilities

### Modified Capabilities

- `publish`: gains a requirement for the change-set address report.
- `harness-portability`: *the submit skill's* requirement gains the Pages section of the pull request body.

## Impact

Affected code: a new `src/commands/publish-urls.ts` reading the git change set and reusing `pageServedAt`
(`src/core/browse/page-url.ts`); `src/config/schema.ts` (`serve.previews`, optional, no shipped default);
command registration. Shipped prose: `templates/skills/ctxr-submit.md` step 8, in the template per house rule.
Stores that declare nothing and never publish a page see no difference.
