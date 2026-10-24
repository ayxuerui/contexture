Re-scans one of your sessions, as `ctxr session status` does: its uncommitted changes, the diff stat of committed and uncommitted work, and its commits not yet in the store. With `diff: true` it also returns the unified diff of uncommitted work, cut at 100 KB.

This is what `git status` and `git diff` are in a local session. Use it before writing the pull request's description, and to check the session holds exactly the change you meant.
