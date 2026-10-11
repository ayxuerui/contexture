## Store fundamentals

### Root resolution

Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the store found by walking up from the current directory when it is a linked git worktree of the store named by `CONTEXTURE_STORE_ROOT`; the `CONTEXTURE_STORE_ROOT` environment variable; walking up from the current directory looking for `__CONFIG_FILE_NAME__`. No other flag or environment variable selects the root. Inside a session worktree, commands therefore act on that worktree; to target the canonical clone from there, pass `--root "$CONTEXTURE_STORE_ROOT"`.

### Frontmatter schema

- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.

### Note templates

Start a new note from a template under `__TEMPLATES_PATH__`, never a blank file or a copied sibling, and substitute `{{title}}` and `{{date}}` yourself — `ctxr lint` reports one left in. Keep the kind the template stamps into `tags`: it is how your own search finds every note of a kind, since no `ctxr` command filters by it.

### Write path

Every write happens inside a session worktree (`ctxr session start`), never on the default branch, and lands through a reviewed pull request that `ctxr-submit` opens when the operator asks to wrap up. Do not edit files in the store root directly.

### Identity and recall

Identity, persona, and the agent's conversational recall — what it remembers of the user and of itself from one session to the next — belong to its harness, not to this store. Subject-matter knowledge belongs here, including anything worth finding again in a later session: the store holds knowledge and skills, documented as portable markdown under `__SKILLS_PATH__`, and never a persona or recall file of its own.
__MISSION_POINTER__
