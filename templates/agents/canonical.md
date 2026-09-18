## Store fundamentals

### Root resolution

Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the store found by walking up from the current directory when it is a linked git worktree of the store named by `CONTEXTURE_STORE_ROOT`; the `CONTEXTURE_STORE_ROOT` environment variable; walking up from the current directory looking for `__CONFIG_FILE_NAME__`. No other flag or environment variable selects the root.

The worktree step is why a command run inside a session worktree operates on that worktree rather than on the canonical clone, even with `CONTEXTURE_STORE_ROOT` exported: the variable names which *store*, and a worktree raises which *checkout* of it. Standing in a different store still resolves the variable, unchanged. To target the canonical clone from inside a worktree, name it: `--root "$CONTEXTURE_STORE_ROOT"`.

### Frontmatter schema

- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.

### Note templates

A new note starts from a template under `__TEMPLATES_PATH__`, not from a blank file and not by copying whatever sibling happens to be nearby. Substitute `{{title}}` and `{{date}}` as you write it — no command expands them, and a note that lands with one still in it is reported by `ctxr lint`. A template is never a note: nothing under that path is catalogued, graphed, or retrieved. Add your own kinds there alongside the shipped ones; contexture only ever rewrites the ones it delivered.

### Write path

Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, and the work stays there for as long as the session runs. When the operator asks to wrap up, `ctxr-submit` validates with `ctxr doctor`, commits, pushes, and opens (or reports how to open) a pull request — that request is what triggers it, not having finished a piece of work. Do not edit files in the store root directly.

### Identity and memory

Identity, persona, and durable cross-session memory for the agent working this store belong to its harness, not to this store — the store holds knowledge and skills, documented as portable markdown under `__SKILLS_PATH__`, never a persona or memory file of its own.
__MISSION_POINTER__
