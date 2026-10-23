## Context

`ctxr session` today has `start`, `capture` and `list`. Commit, push, opening a pull request, rebase and worktree removal are all skill prose over `git` and `gh`, by decision of `2026-09-02-session-keeps-only-what-git-cannot-do`.

Since then the CLI has gained `ctxr land`, `ctxr review list` and `src/core/forge/`: an App or `gh` credential, `runRemoteGit`, `pullsForHead` and `createPull`. The MCP surface's `src/core/mcp/sessions.ts` reimplements start, commit-as, publish (push plus open the pull request, idempotently) and remove for its own writes.

## Goals / Non-Goals

**Goals:**
- One implementation of each lifecycle step, which both `ctxr session <verb>` and the MCP tool `session_<verb>` call.
- Skill text that names the command, so the CLI rendering and the MCP rendering differ only in the call's spelling.

**Non-Goals:**
- No change to landing, consent or the approval page.

## Decisions

### D1. Answering #31: why the commands come back

#31 removed four commands, for these reasons:
1. They wrapped what `git` and `gh` already do.
2. `session submit`'s validation was `doctor` again.
3. `land` re-implemented `gh` behind a state machine tested only against mocks.
4. `abandon` had no session guard and could force-remove any worktree.
5. The forge adapter was a seam with one implementation.

Taken one at a time:
1. **"Git already does it."** That is true for a local agent and false for the MCP surface, whose client has no git. The server must implement these steps regardless, so the question is no longer whether code exists, but whether the CLI shares it or the server keeps a private copy that the skills do not describe. Two lifecycles, one in code and one in prose, is the drift #31 itself warned of when it moved `land`'s three decisions into skill steps.
2. **"Validation is `doctor` again."** It still is. `submit` calls the same check pass as a gate and adds no second validator.
3. **"Mock-only tests."** The tests run against a real bare origin and the fake `gh` used by `land` and the MCP tests. These are integration fixtures, not a mocked git runner.
4. **"`abandon` had no guard."** `discard` refuses any path that is not under `session.worktrees_path` on a session branch, and refuses uncommitted or unpushed work without `--force`. That closes the defect #31 named.
5. **"One-implementation seam."** There is still no adapter kind. The commands call `src/core/forge/` directly, as `land` does.

**What #31 got right and this keeps:**
- The pre-commit hook remains the commit gate.
- The pre-push hook remains the default-branch refusal.
- `reap` stays gone.
- The judgment parts of the skills stay prose.

### D2. `submit` writes the generated sections itself

Today the agent runs `ctxr publish urls` and `ctxr graph diff --format markdown` and pastes their output, and the spec forbids changing a word of it. The command can append both sections, so the skill text shrinks and the rule becomes a guarantee:
- the Knowledge changes block always;
- the Pages table when the report lists a page.

The agent's body is the why, the what, the route, the verification and the follow-ups. The command refuses a body that already contains either section's heading, so the generated section cannot be duplicated or hand-edited.

**Opposing case:** keep the paste. The agent can then fit the section into its own structure, and a reviewer sees that the agent ran the command. It loses because the record exists so the reviewer does not have to trust the agent's account. A generated section that the agent cannot touch is that guarantee, not a convention.

### D3. Command shapes

- `ctxr session status [<session>] [--diff] [--json]`. With no session, it uses the session containing the working directory and is refused outside one.
- `ctxr session submit <session> --branch <name> --message <msg> --title <t> (--body <b> | --body-file <f>) [--json]`:
  - It stages everything in the worktree except derived paths.
  - The branch name is refused when it is the default branch or another live branch.
  - It pushes with the store's forge credential when one is configured, and otherwise with the clone's own transport.
  - Before a retry it checks the remote and the forge, so a commit or pull request that already exists is published once.
  - Exit codes: `0` when the pull request is open, `3` when the doctor gate fails, `2` when the branch or arguments are refused.
- `ctxr session rebase <session> [--continue | --abort] [--json]`: `3` with the conflicting paths and both sides on a conflict, `0` when clean.
- `ctxr session discard <session> [--force] [--close-pull-request] [--json]`.
- `ctxr session list [--json]` gains `uncommitted`, `ahead`, `pull_request {number, state}` and `review {state, comment}`. When the forge is unreachable, the forge columns read `unknown` and the command still exits `0`, because the list is an inventory, not a check.

A session argument is the worktree's directory name, as `session list` prints it.

### D4. Commit identity

Locally the commit uses the clone's git identity, as a hand-run `git commit` does. The MCP surface passes the member's verified email as the author, with an `Edited-by:` trailer, and the recording login as committer when the host has none. This is the same core call with an author override.

## Risks / Trade-offs

- **The skill and the command disagree on a step.** → The affordance check already resolves every `ctxr` option a skill names. The reworded skills name only the commands' options, so a renamed option fails the check.
- **A store's older binary meets newer skill text.** → `ctxr update` writes skills from the running binary.
- **`submit` does too much in one call to be debuggable.** → `--json` reports each step's outcome (staged, gate, commit, branch, push, pull request), and a failure names the step it stopped at, leaving everything before it in place.

## Migration Plan

1. **Ship** the commands and the reworded skills in one release.
2. **The MCP change builds its tools on `src/core/session/`** and deletes its private `sessions.ts` helpers.
3. **Rollback** is the previous release. Sessions are ordinary worktrees and pull requests either way.
