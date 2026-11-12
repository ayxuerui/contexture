Makes an exact string replacement in a file in one of your sessions, like a local Edit tool.

- `file_path` is under the root of a session you started: the `root` that `session_start` or `session_list` gave, then the path in the store, e.g. `<root>projects/kestrel.md`. A path outside every session root is refused; call `session_start` first.
- Read the file first (at the same session path), and copy `old_string` exactly as it appears, including indentation and line breaks. Do not include the line-number prefix that `Read` shows.
- The edit fails if `old_string` is not unique in the file. Give more surrounding text to make it unique, or set `replace_all` to change every occurrence.
- Notes, captures, templates, house conventions and the log can be edited. The configuration, the hooks directory and other `.git` files, derived files, the worktrees path and the managed skills cannot.

The change rests in the session's working tree. Nothing is committed, published or put up for approval until you call `session_submit`, so make every edit the change needs first.
