## D1 — Landing is a state machine, not a script

`session land` reads the pull request's state before doing anything and branches: open + mergeable → merge; open + conflicting → stop with the conflict guidance; open + unknown → re-query once, then stop; merged → skip to sync; closed → stop. Every arm that performs an external side effect (merge, worktree removal) is preceded by a gate that `--yes` or an interactive confirmation passes, and `--no-input` without `--yes` is a hard error — a non-interactive caller must say what it consents to. A retry after a failed arm re-reads state and never replays an arm blindly; the audited store's worst incident class was a replayed push after a partially successful merge, and the same shape exists for merges.

## D2 — Sync is fast-forward only, in the root checkout

The root checkout is every future session's start point, so landing brings its default branch up to date — but only by fast-forward. A root checkout that is off the default branch, dirty in a way that blocks, or diverged is reported with what was found and left alone; the command never checks out, resets, or discards there. Sessions started from a stale root still fetch first, so a skipped sync degrades to slowness, not to wrong bases.

## D3 — Reaping is opt-in and scoped

The command commonly runs from inside the session worktree it would remove, and some stores hand worktree lifecycle to an external layer. So `--reap` is off by default; when given, it removes only a worktree `session start` created, only when clean, and only after the forge reports merged — the same rule `session reap` applies. Without the flag the command names `session reap` in its report and asserts nothing about cleanup.

## D4 — Two skills at the seam, one skill around it

`ctxr-submit` and `ctxr-land` are the verbs an agent reaches for at the end of a session and after review; each is one screen and ends in exactly one command. What surrounds them — how a session starts, why re-scanning before any plan is mandatory, the rebase conflict playbook, how to sequence several pull requests — stays in `ctxr-session-lifecycle`, which both reference and neither repeats. The submit skill runs the capture pass exactly once (it is a wrap signal itself) and the land skill never instructs a manual merge.

## D5 — Forge interface v2

`pullRequest(cwd, ref)` and `mergePullRequest(cwd, number, method)` join `isAvailable` and `openPullRequest`. The GitHub adapter maps them to `gh pr view --json number,url,state,mergeable,headRefName` and `gh pr merge --<method>`; mergeability `UNKNOWN` is passed through so the command can re-query. The interface version bumps to 2 because a forge adapter without these operations cannot land; `adapters.compatibility` reports the mismatch rather than the command failing mid-way.

## Risks

- **[Risk] `session land` merges the wrong pull request.** → It resolves from the current branch unless told otherwise, prints number, title, and url before the gate, refuses on the default branch, and refuses when the resolved head branch differs from the branch it was asked about.
- **[Risk] A transport error after a successful merge triggers a duplicate merge on retry.** → The retry re-reads state; a merged pull request skips the merge arm.
- **[Risk] A third-party forge adapter breaks on the version bump.** → The compatibility check names the adapter and the missing version before any session command runs.
