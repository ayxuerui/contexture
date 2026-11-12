Starts a session: your own working copy of the store, on a branch of its own, where `Edit`, `Write`, `Move`, `Delete` and `ctxr_write` make their changes. It is `ctxr session start` on the server.

- `label` is a short name for what the session is for, e.g. `kestrel-launch`. A label another live session carries is refused; pick another.
- The result gives the session's directory name (`session`) and its `root`. Address every file in the session as the root followed by the store path, e.g. `<root>projects/kestrel.md`, and pass the directory name wherever a tool asks for `session`.
- Keep one session per piece of work. Two unrelated changes are two sessions, so each can be approved on its own.

Before starting one, call `session_list`: the person may already have a session open for this work.
