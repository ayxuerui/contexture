Lists your sessions, as `ctxr session list --review` does: each one's directory name, root, branch and label, whether it has uncommitted changes, its commits not yet in the store, its open pull request, and the decision on it.

- `review.state` is the approval page's decision: `awaiting`, `approved`, `changes-requested`, `needs-reapproval` or `blocked`. For `changes-requested`, `review.comment` is what the decider asked for: make those changes in the same session and call `session_submit` again.
- `kind: capture` marks a session the `capture` tool opened; it closes once someone decides on it.
- Only your own sessions are listed.

Call it at the start of a conversation about changing the store, and mention open sessions to the person before starting another.
