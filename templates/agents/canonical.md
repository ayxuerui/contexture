## Store fundamentals

### Root resolution

Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory looking for `__CONFIG_FILE_NAME__`. No other flag or environment variable selects the root.

### Frontmatter schema

- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.

### Write path

Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, then `ctxr-submit` validates with `ctxr doctor`, commits, pushes, and opens (or reports how to open) a pull request. Do not edit files in the store root directly.

### Identity and memory

Identity, persona, and durable cross-session memory for the agent working this store belong to its harness, not to this store — the store holds knowledge and skills, documented as portable markdown under `__SKILLS_PATH__`, never a persona or memory file of its own.
__MISSION_POINTER__
