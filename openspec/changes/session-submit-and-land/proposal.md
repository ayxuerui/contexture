## Why

A session ends in two moves: **submit** (capture what was durable, then commit, push, and open the pull request) and, after review, **land** (merge, sync the default branch, reclaim the worktree). Contexture has the first as a command and neither as a skill an agent reaches for at the end of a session; the second exists only as prose ("until `session land` ships, the manual equivalent is…") inside a long lifecycle skill. The migration target needed two overlay skills (`ship`, `land`) to give agents those verbs, and its own merge state machine to avoid the incident class every store hits eventually — a replayed push or merge after a partial failure. Both verbs are store primitives: every store has a forge, a default branch, and sessions that must end safely. The decision: `submit` and `land` are contexture's, as commands and as skills.

## What Changes

- **`ctxr session land`** completes a reviewed session: resolves the pull request for the current session branch (or `--pr <n>` / `--branch <name>`), reads its state from the forge, and branches on it — open and mergeable → gate → merge (squash by default, `--merge-method`) → confirm the forge reports merged; already merged → skip to sync; closed → stop; conflicting or unknown → stop with the conflict guidance. Then it synchronizes the default branch in the root checkout by fast-forward only (a checkout that will not fast-forward is reported, never forced) and, with `--reap`, removes the session's worktree when it is clean; otherwise it names `session reap`. The gate is an interactive confirmation or `--yes`; `--no-input` without `--yes` fails loud rather than merging silently. A retry re-reads state and performs only the remaining steps.
- **`ctxr session submit`** gains `--branch <name>` to rename the session branch before pushing, so a machine-generated branch name never reaches the forge.
- **Forge adapter interface v2**: `pullRequest(cwd, ref)` returning number, url, state (open / merged / closed), mergeability (mergeable / conflicting / unknown), and head branch; `mergePullRequest(cwd, number, method)`. The GitHub adapter implements both through `gh`.
- **Two new owned skills**, delivered by init and update: **`ctxr-submit`** (re-scan → capture pass via `ctxr-session-capture`, once → surgical staging → one unit per pull request → fire gate → `ctxr session submit` → verify before any retry → hand off to land) and **`ctxr-land`** (`ctxr session land` → gate → merge → sync → reap or leave external → report; conflicts go to the lifecycle skill's playbook). **`ctxr-session-lifecycle`** narrows to what surrounds them: start, the re-scan discipline, the conflict playbook, multi-PR sequencing.
- **BREAKING**: forge adapter interface version 1 → 2 (a third-party forge adapter must add the two operations; the built-in one is updated in step, and `adapters.compatibility` reports a stale one).

## Capabilities

### Modified Capabilities

- `write-lifecycle`: landing as a gated state machine; submit's branch rename.
- `adapters`: forge adapters read pull-request state and merge.
- `harness-portability`: the owned skill set gains `ctxr-submit` and `ctxr-land`; the lifecycle skill is narrowed.

## Impact

Affected code: new `src/commands/session-land.ts`, `src/commands/session-submit.ts` (`--branch`), `src/adapters/forge/{types,github}.ts` (v2), `src/core/checks/adapter-checks.ts` (compatibility), `src/core/git/repo.ts` (rename, fast-forward), `src/core/procedures.ts` (two new skills, one narrowed), `src/run.ts`, `openspec/specs/cli-contract`. Supersedes the session-landing item of `store-primitives-from-migration-audit`, which is trimmed accordingly; the migration target's `ship` and `land` overlays retire once this lands.

## Non-goals

- Deciding what to capture, which unit rides which pull request, or whether to split — judgment; the skills carry the decision rules, the commands execute.
- Managing worktrees the store did not create (a harness-provided workspace) — `--reap` acts only on a worktree `session start` made; anything else is reported and left to whoever owns it.
- Resolving merge conflicts — the command stops on a conflicting pull request; the rebase playbook stays a procedure because every conflict needs a reader.
- Branch protection or required checks — the forge's business; the command reads mergeability, it does not configure it.
