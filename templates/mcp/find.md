Look for notes in the store that contain a literal word or phrase (case-insensitive), or, with no text, get the map of the store.

With text: returns `notes` in path order — each with its path, its one-line gloss, up to three matching lines with line numbers, and a link when the store has a browsable address. There is no relevance score; choose from the glosses. Matching raw captures that have not been filed into a note come back separately in `unfiled` (marked `pending_merge` when still waiting to be merged); they are not what the store says, so never quote them as its position.

Without text: returns every section of the store's catalog with the notes it lists and their glosses — use it to find the right words or the right notes to pass to `gather` as seeds.

Use `under` to look in one folder only. Search for the distinctive word (a name, a project, a term), not a whole question.
