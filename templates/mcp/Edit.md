Makes an exact string replacement in a note, like a local Edit tool.

- Read the note first, and copy `old_string` exactly as it appears, including indentation and line breaks. Do not include the line-number prefix that `Read` shows.
- The edit fails if `old_string` is not unique in the note. Give more surrounding text to make it unique, or set `replace_all` to change every occurrence.
- Only notes can be edited: never configuration, the entry document, captures or tool-owned files.

Edits do not change the store directly. Each one is saved to your draft, a pull request that collects all of your edits and lands only once someone approves it on the store's approval page. Tell the person that, and give them the approval link the result returns. If someone asked for changes on your draft, more edits go into the same draft.
