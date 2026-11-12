Read notes in full, together with the notes linked to and from them — the store's own way of pulling in related context.

Start from note paths `find` returned (`seeds`), from a catalog section, from a folder (`under`), or from a note whose backlinks to follow (`entities`). With `hops: 1` (the default) you also get every note one link away; `hops: 0` returns only the notes you named. Each note carries why it is there (the labels, and its distance in links) and its full text, in a fixed order, until a size budget runs out; the remaining notes are listed without text — gather them again by name if you need them.

Cite what you use by its path. A capture (a path under the inbox) cannot start a gather: it is not a note yet. Read it with `Read` instead.
