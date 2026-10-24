Runs a read-only `ctxr` command, as a local agent runs it in a terminal, and returns its exit code and output.

- `args` is the command and its arguments, one item each, e.g. `["lint"]`, `["doctor"]`, `["catalog", "show", "--section", "projects"]` or `["graph", "query", "neighbors", "projects/kestrel.md"]`. Add `"--json"` for machine-readable output.
- Without `session` it runs against the store as it is now. With `session` it runs in that session of yours, so `["graph", "diff", "--since", "origin/main"]` and `["lint"]` see your uncommitted work.
- Paths in arguments are store paths, or under your session root when you name a session. The root option and paths outside the store are refused.

When a skill says to run a `ctxr` command that only reads, run it here.
