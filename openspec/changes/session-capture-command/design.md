## D1 — The proposal file is the contract between judgment and execution

The command consumes exactly the structure the skill already makes the agent produce: a YAML document with `notes` (path, optional visibility value, optional extra frontmatter, body, and `mode: create|append`), `world_facts`, and `user_facts` (each a list of `{action: add|replace|remove, text, match?}`). Items carry their proposal ids so the report can name them. The agent writes only approved items into the file, so "approve by id" happens in the conversation and the command never needs to know about approval at all.

## D2 — Per-item refusal, never all-or-nothing

A capture with one bad path should still land the other nine notes. Each item is validated independently (path gate, frontmatter shape, unique match for replace/remove) and either written or refused with a reason; the exit code is non-zero only when at least one item was refused, and the report distinguishes `wrote`, `appended`, `refused`, and `skipped`. Nothing is written for a refused item — validation precedes the write.

## D3 — Identity roles are resolved paths, not a directory plus fixed names

`identity.files` binds each role to a path; `identity.path` remains the default parent and the retrieval-excluded directory. Every reader and writer goes through `identityFilePath(config, role)`, so a store whose runtime keeps its memory elsewhere points the role there and contexture writes through the same file the runtime reads — the file is the mechanism, which is the whole point of the agent-identity design. The exclusion invariant checks each resolved path, not the directory, so a file relocated outside `identity.path` still cannot leak into retrieval.

## D4 — Entries, not sections

Real identity files come in two shapes: heading-sectioned markdown and flat entry lists with a delimiter line. One model covers both: an entry is the text between two delimiter lines (default delimiter: an empty line, so paragraphs are entries; a heading-sectioned file's headings simply become entries too). `add` appends an entry at the end (after the last delimiter); `replace` and `remove` locate the one entry containing `match` and refuse on zero or several. No section vocabulary, no format detection.

## D5 — One path gate, two enforcement points

The symlink-escape rule is absolute: a path whose canonical location leaves the store is never written or committed. The sanctioned-location rule is opt-in through `write_lifecycle.writable_paths` — an existing store with notes wherever they happen to live keeps committing; a store that declares the list gets a gate. Both rules live in one function used by `staged.path_allowlist` (commit time, via the pre-commit hook) and by `session capture` (write time), so the two can never disagree. Contexture-owned locations (identity files, conventions, procedures, catalog, entry files) are always sanctioned.

## Risks

- **[Risk] A proposal file is hand-edited into something the agent did not propose.** → The command reports every write by path and id; the skill's report step is the command's output, so an unexpected write is visible, not silent.
- **[Risk] `replace` matches the wrong entry on a short substring.** → Refusal on multiple matches; the skill instructs quoting a distinctive span, and the report shows the entry that was replaced.
- **[Risk] A relocated identity file sits inside a retrievable directory.** → `identity.excluded_from_retrieval` fails on the resolved path, and `doctor` blocks `session submit`.
