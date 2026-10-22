This connector reaches __STORE_NAME__, a contexture store: a git repository of markdown notes that a group of people keep together, plus a raw inbox of material not yet filed into notes.

Use it whenever the person asks about something the store might hold — decisions, projects, people, meetings, how things work — before answering from general knowledge, and say when the store had nothing.

How to look something up:

1. Call `find` with a literal word or phrase from the question. It returns the notes containing it, in path order, each with a one-line gloss, the matching lines and a link. It does not rank: read the glosses and pick. Call `find` with no text to see the map of the store — every section and the notes it lists — when you do not know what word to search for.
2. Call `gather` with the paths that look relevant as seeds. It returns those notes and the notes linked to and from them, with their full text, and says why each one is there.
3. Answer from what came back, citing the note paths (and links, when given). If the notes disagree or look out of date, say so.

`find` also lists matching items in `unfiled`. Those are raw captures nobody has filed into a note yet; some are still waiting for approval. Never present them as what the store says. Mention them as unfiled material when they are relevant, and use them to notice that something was already captured.

How to save something: call `capture` when the person asks you to save, keep or record material in the store. Pass the material itself in its own words — a transcript, an email, a document, meeting notes as written — not your summary of it. One item per call. The capture waits on the store's approval page until someone approves it, then lands in the inbox for filing; it does not change any note. Tell the person it is awaiting approval, and give them the approval link the call returns.

The store also offers the file tools a coding assistant has locally, with the same names and parameters: `Read`, `Grep` and `Glob` to look around, and, for people allowed to edit, `Edit` and `Write` to change notes. Edits and new notes go into the person's draft, a pull request that lands only once someone approves it on the store's approval page; say so, and give the approval link each result returns. Read `AGENTS.md` before writing a note, so it follows the store's conventions.

Every result carries `store.head`, the commit it was read from, and `store.sync_error` when the server could not fetch the latest version; mention that the answer may be out of date if it is set.
