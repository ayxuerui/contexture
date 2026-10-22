A search tool over the store's files, built on ripgrep, with the same parameters as a local Grep tool.

- Supports full regular-expression syntax (e.g. `kestrel.*launch`, `^## Decisions`).
- Filter files with `glob` (e.g. `projects/**/*.md`) or `type` (e.g. `md`).
- `output_mode`: `content` shows matching lines (with `-n` line numbers, `-A`/`-B`/`-C` context); `files_with_matches` shows only file paths (the default); `count` shows match counts.
- `multiline: true` lets a pattern span lines.
- Results are in path order. Use `head_limit` and `offset` to page through many results.
- Matching captures still awaiting approval are listed after the results. They are not in the store yet.

For a plain question about what the store knows, `find` (with glosses and links) is usually the better start. Use Grep for an exact pattern.
