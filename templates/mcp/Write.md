Creates a new note, like a local Write tool, except that it never overwrites. Use `Edit` to change a note that already exists.

- `file_path` is relative to the store root and must end in `.md`, e.g. `projects/kestrel-launch.md`. Put it where similar notes live: use `Glob` or `find` to see the store's folders first.
- Follow the store's conventions for notes (frontmatter, headings, links). `Read` `AGENTS.md` if you have not.
- Captures of outside material go through `capture`, not `Write`.

Like edits, a new note goes into your draft and lands only once someone approves it. Tell the person, and give them the approval link the result returns.
