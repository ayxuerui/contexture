Submits one of your sessions for approval, as `ctxr session submit` does: it stages every change in the session, runs `ctxr doctor` as the gate and stops with its report if the store fails, commits with your `message` as the person you are signed in as, names the branch `branch`, pushes it, and opens the pull request with your `title` and `body` — or updates the open one.

- Only when the person asks to submit, or clearly wants the change made. Their request is the consent to put it up for approval.
- Write the `body` for the person deciding: why, what changed, how you checked it, and anything left to do. The Pages and Knowledge changes sections are appended for you; leave them out.
- `branch` is a short descriptive name, e.g. `notes/kestrel-intro`. Submitting again after requested changes keeps the same branch and the same pull request.
- If the gate fails, fix what its report names (often `ctxr_write` with `["catalog", "build"]` after adding a note) and submit again.

Nothing lands until someone approves it on the approval page. Tell the person, and give them the `approval_url` the result returns.
