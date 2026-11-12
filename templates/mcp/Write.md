Creates a new file in one of your sessions, like a local Write tool, except that it never overwrites. Use `Edit` to change a file that already exists.

- `file_path` is under the root of a session you started, e.g. `<root>projects/kestrel-launch.md`. A path outside every session root is refused; call `session_start` first.
- Put a new note where similar notes live: use `Glob` or `find` to see the store's folders first. Follow the store's conventions for notes (frontmatter, headings, links); `Read` `AGENTS.md` if you have not. A file where notes live must parse as a note.
- Captures of outside material go through `capture`, not `Write`.

The new file rests in the session's working tree until you call `session_submit`. A new note usually needs `ctxr_write` with `["catalog", "build"]` before submitting, so the catalog lists it.
