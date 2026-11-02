## 1. Which layer?

The connector's instructions list this store's layers, each with its description, under *This store*;
AGENTS.md's "Placing a new note" section lists them too. Choose by what the content fundamentally IS, not by
surface keywords; a label on a location says nothing about what is actually kept there.

- A layer whose description names an end state, a finish line or a deadline takes only what has a finish
  line: if it never closes, it does not belong there. An item in that layer that can never close is a smell
  — it either clutters the layer as open-forever or gets retired prematurely. Never create one on purpose;
  an ongoing responsibility with a standard to maintain belongs in a layer whose description says so.
- A layer whose description says it holds completed, abandoned or inactive items is where the other layers'
  finished or dropped items go — never a first placement. Retire a note with `ctxr archive <path>` (a
  tracked move; frontmatter untouched).

If the store lists no layers, there is no layer decision: place the note next to the notes it will link to
most (`ctxr graph query neighbors <path>` on the closest existing note shows that cluster) and let wikilinks
carry the structure. If no layer fits, use the catch-all location AGENTS.md names and revisit the placement
later.
