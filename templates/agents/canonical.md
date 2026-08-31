## Store fundamentals

### Root resolution

Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory looking for `__CONFIG_FILE_NAME__`. No other flag or environment variable selects the root.

### Frontmatter schema

- Visibility field: `__VISIBILITY_FIELD__:` — resolves explicit value, then directory default, then the configured fail-closed default (`__DEFAULT_CONTEXT__`). See `ctxr note resolve <path>`.
- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.
- Disclosure audience tags (optional, hand-written): `audience: [<name>, ...]`.

### Write path

Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, then `ctxr session submit` validates, commits, pushes, and opens (or reports how to open) a pull request. Do not edit files in the store root directly.

### Procedure index

Judgment-driven operations, documented as portable markdown under `__PROCEDURES_PATH__` — read one directly, no harness-specific discovery required:

__PROCEDURE_INDEX__
