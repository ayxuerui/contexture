Reads a file. Works like a local Read tool: `file_path` is relative to the store root (a leading `/` means the store root), and the result is numbered like `cat -n`, starting at 1.

- A path under the root of one of your sessions (`<root>projects/kestrel.md`) reads that session's working tree, including changes not yet submitted. Any other path reads the store as it is now.
- By default it reads up to 2000 lines from the start; use `offset` and `limit` for longer files.
- It reads notes, the entry document (`AGENTS.md`), captures under the inbox, the note templates, the house conventions, the log and the skills. A capture is raw material not yet filed into a note: never present it as what the store says.
- The configuration, derived files and paths the store excludes cannot be read.
- A note's result names its page on the store's site. When you cite the note to the person, include that link.
