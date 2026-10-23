## Why

The MCP surface is getting session tools: `session_start`, `session_list`, `session_status`, `session_submit`, `session_rebase` and `session_discard` (change `serve-the-session-lifecycle-to-chat-apps`). A chat app cannot run git, so the server has to implement each step itself.

If the CLI keeps leaving those steps to `git` and `gh` through skill text, the store has two lifecycles that drift: one in code on the server and one in prose on the laptop. Each needs its own skill wording, and a fix to one never reaches the other.

One implementation in `src/core/`, reached through `ctxr session <verb>` locally and `session_<verb>` over MCP, gives the same steps, the same gates and the same skill text on both surfaces.

This reverses part of `2026-09-02-session-keeps-only-what-git-cannot-do`, which removed `session submit`, `land`, `abandon` and `reap` (#31). Its arguments are answered in design.md D1.

## What Changes

- **`ctxr session status [<session>]`:** the re-scan in one command, with `--json`. It covers the short status, the diff stat of committed and uncommitted work, the commits ahead of the remote default branch, and with `--diff` the unified diff.
- **`ctxr session submit <session>`:** the mechanical steps of `ctxr-submit` in one command.
  - Options: `--branch`, `--message`, `--title`, and `--body` or `--body-file`.
  - Steps: it stages every change outside derived paths, runs `ctxr doctor` as the gate, commits, renames the branch, pushes (with lease after a rewrite), and opens or updates the pull request.
  - **It writes the generated sections itself:** the body gets the Pages section from `publish urls` and the Knowledge changes section from `graph diff --format markdown` appended verbatim, so the agent no longer pastes them.
  - It verifies before any retry, and returns the pull request and the approval page's address.
- **`ctxr session rebase <session> [--continue | --abort]`:** the conflict playbook's mechanics. It fetches and rebases onto the default branch, and on a conflict reports each conflicting path with both sides.
- **`ctxr session discard <session> [--force] [--close-pull-request]`:**
  - It removes a session worktree and its local branch.
  - It refuses a path that is not a session worktree, and refuses uncommitted or unpushed work without `--force`.
  - It never closes a pull request unless asked.
- **`ctxr session list`** gains each session's uncommitted state, commits ahead, its pull request, and, when the store declares `change_approval`, the decision state that `ctxr review list` reports. `ctxr review list` stays as it is.
- **Skills reworded around the commands.** `ctxr-submit` and `ctxr-session-lifecycle` keep every judgment step: the When and anti-trigger sections, routes, the one-unit rule, the capture pass, the rollup offer and the hand-off. Each git or gh sequence becomes the command. `ctxr-land` is unchanged.
- **BREAKING (skill text only):** the submit skill no longer runs `git push` or `gh pr create` itself.

## Non-goals

- **Wrapping single git commands that a local agent runs fine** (`git mv`, `git rm`, `git show`). These are file operations a local harness's own tools cover. The MCP surface gives them as `Move` and `Delete`, which match the harness's file tools rather than a `ctxr` command.
- **Bringing back `session reap`.** Removal stays an explicit `discard` per session, as the lifecycle skill already has it.
- **A forge adapter kind.** The commands use the forge client and credentials that `ctxr land` already uses (`src/core/forge/`), so there is still one forge and no seam.
- **Changing what consents to a push.** The request to submit is still the consent, as it is today, and the command adds no prompt.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `write-lifecycle`: the session commands `status`, `submit`, `rebase` and `discard`, and the richer `session list`.
- `harness-portability`: submit and the lifecycle skill drive the session commands instead of `git` and `gh`.

## Impact

- **Code:**
  - New `src/core/session/` (`status`, `submit`, `rebase` and `discard`, used by both the CLI and the MCP surface).
  - New `src/commands/session-{status,submit,rebase,discard}.ts`.
  - `session-list.ts` is extended.
- **Templates:** `ctxr-submit.md` and `ctxr-session-lifecycle.md` are reworded.
- **Tests:** they reuse the bare-origin plus fake-`gh` fixtures that `land` and the MCP write tests already have.
- **Stores:** the reworded skills arrive with `ctxr update`, from a binary that has the commands.
