Deletes a file in one of your sessions: what `git rm` does in a local session.

- `file_path` is under one of your session roots. The same protected paths as `Edit` are refused.
- The working-tree copy is gone at once. If the file was in the store, its last version stays in history, and the deletion only lands once someone approves the submitted session.

Ask the person before deleting a note they did not name. Nothing is committed until `session_submit`.
