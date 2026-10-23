Removes one of your sessions, as `ctxr session discard` does: its working copy and its branch on the server.

- A session holding changes that were never submitted is refused unless `force: true`, which throws that work away. Ask the person first.
- `close_pull_request: true` also closes its open pull request, withdrawing it from the approval page.
