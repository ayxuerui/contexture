Moves or renames a file in one of your sessions: what `git mv` does in a local session.

- `source_path` and `destination_path` are both under the same session root, e.g. `<root>projects/old.md` to `<root>archive/old.md`.
- The destination must not exist yet; Move never overwrites. The same protected paths as `Edit` are refused on either side.
- Notes that link to the moved file are not changed for you: find them with `Grep` in the session and fix the links with `Edit`.

Nothing is committed until `session_submit`.
