The land half of the session lifecycle, after review. `ctxr-submit` is the other half; `ctxr-session-lifecycle`
covers what surrounds both and is not repeated here.

1. Resolve the target: the current session branch by default, or name one with `--branch <name>` or
   `--pr <n>`. Never run this against `__DEFAULT_BRANCH__` itself.
2. Run `ctxr session land` (add `--yes` only when you already have explicit approval from elsewhere in
   this conversation; otherwise let it prompt). It reads the pull request's state, gates the merge behind
   an explicit confirmation, merges with `--merge-method` (default squash), confirms the forge reports
   merged, and fast-forwards the default branch in the checkout it runs from when that checkout is on
   `__DEFAULT_BRANCH__` — a checkout that cannot fast-forward is reported, never forced.
3. Conflicting or unknown mergeability stops the command; follow `ctxr-session-lifecycle`'s conflict
   playbook, then retry — a retry re-reads state and performs only what remains.
4. Add `--reap` to remove the session worktree in the same run, once it is clean and merged; otherwise
   run `ctxr session reap` afterward, or leave cleanup to whoever owns the worktree.
5. Report exactly what the command reported — merged or not, synced or not (with why not), reaped or not
   (with why not). Never claim a merge or a cleanup the command itself did not confirm.

Never merge by hand (a raw forge-CLI merge, the forge's web UI on this agent's behalf): `ctxr session land`
is the only merge path, so every landing leaves the same audit trail and passes through the same gate.
