Reads a file from the store. Works like a local Read tool: `file_path` is relative to the store root (a leading `/` means the store root), and the result is numbered like `cat -n`, starting at 1.

- By default it reads up to 2000 lines from the start; use `offset` and `limit` for longer files.
- It reads notes, the entry document (`AGENTS.md`), and captures under the inbox. A capture is raw material not yet filed into a note: never present it as what the store says.
- If you have a pending draft that changed this note (from `Edit` or `Write`), you get your draft's version, marked as such. Other people still see the version in the store until your draft is approved.
- Configuration, derived files and tool-owned folders cannot be read.
- A note's result names its page on the store's site. When you cite the note to the person, include that link.
