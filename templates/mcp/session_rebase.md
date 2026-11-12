Brings one of your sessions up to date with the store, as `ctxr session rebase` does: it fetches the default branch and replays the session's commits onto it.

- On a conflict the result lists each conflicting file under the session root, with both sides' text, and leaves the rebase in progress. Edit each file so it keeps both sides' meaning and has no conflict markers left, then call again with `continue: true`. `abort: true` puts the session back as it was.
- While a rebase is in progress, `session_submit`, `Move` and `Delete` are refused.
- A session with uncommitted changes cannot be rebased; submit it first.
