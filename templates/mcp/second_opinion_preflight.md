Checks that each critic of a second opinion answers, as `ctxr second-opinion preflight` does, and returns the command's exit code and output.

- Call it before the first critique or poll of a conversation. It names each critic that cannot answer and why.
- `tier` is `strong` (the default) or `fast`. `only` is a comma-separated list of the critics to check: `claude`, `codex`, `agy`.
- The server chooses each critic's model. No field changes that.
