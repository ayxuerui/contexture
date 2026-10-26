Runs a `ctxr` command that writes, inside one of your sessions, and returns its exit code and output. Commands such as `ingest`, `archive`, `entry append`, `rollup write`, `source stamp`, `session capture` and `catalog build` run here.

- `session` is required: the directory name of one of your sessions.
- `args` is the command and its arguments, one item each. Name files under your session root, e.g. `["ingest", "<root>raw/inbox/call.md", "--into", "<root>projects/kestrel.md", "--source-type", "meeting", "--source-id", "meeting/7"]`.
- For a command that reads a file you would otherwise write yourself (`rollup write --content-file`, `session capture --proposal`), pass the text as `input` and the argument `"@input"` in its place.
- A command that tries to change the configuration, the hooks directory or another protected path has that change undone, and the call is refused.

What it changes rests in the session until `session_submit`.
