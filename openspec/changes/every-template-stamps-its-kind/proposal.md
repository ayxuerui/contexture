## Why

Four of the six packaged note templates write the kind they are for into the note's tag field (`People`, `Company`, `Deal`, `Project`). The other two leave it empty, and no requirement says why or what the field is for. Nothing in contexture reads it (#92). So a store gets a seeded convention with no stated purpose and no stated owner, and the two templates without a kind make it look accidental.

The field earns its place, though, and removing it would cost more than it saves:

- **A seeded kind is right by construction.** It is written at the one moment the kind is known for certain: when the agent picks the template. The decay #92 reports is in a store's *own* tag vocabulary (`DailyNote` used 0 times, `PermanentNote` applied everywhere). The seeded `Project` (39 notes) and `People` (31) are in active use.
- **It answers a question nothing computed does.** "Every person note" is not answerable by the catalog (position), the graph (links), or `--under` (path), and `standardize-note-templates` D6 is the argument that position cannot stand in for kind. A stamped kind makes it one line of the agent's own content matching, which is leg 3 working as designed.
- **The main downstream store depends on it.** pkm requires tags on every note and carries about 420 tagged notes. Dropping the seed would leave its agents to remember a field the template used to fill, which is the decay #92 is about, caused by the fix.

What is missing is the rule and the statement, not the field.

## What Changes

- **Concept** stamps its kind like the other entity and work templates. **Note**, the base a store copies to cut its own kinds, keeps the field present and empty, because the base is for no kind in particular. That is the rule: every packaged template other than the base names its own kind; the base carries the field empty.
- **The generated `AGENTS.md`**, in its "Note templates" subsection, says what the field is: it records the kind a note was started from; contexture never reads, validates, or selects by it; it is there so the store's own search can find every note of a kind. A kind the store cuts from the base should stamp its own name the same way, and any further tags the store's conventions call for are the store's.
- **harness-portability**'s library requirement states the rule, without naming the key (the field is the store's, so no spec depends on its name).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: "A store declares which note templates it installs" gains the kind-stamping rule, the statement that no component reads the field, and two scenarios. Every existing scenario is carried unchanged.

## Non-goals

- **A `--kind` retrieval selector, or any component reading the field.** It would turn the retrieval pass into a frontmatter query surface (`--status`, `--tag` follow by the same argument), and the kind would still be agent-asserted. Argued in design.md D3.
- **Declaring a kind vocabulary in `contexture.yaml`.** Nothing would check it, so it decays the way #92 shows a declared vocabulary does. A store's conventions are already inlined into `AGENTS.md`, which is where a vocabulary belongs. Design.md D3.
- **Validating tags in `ctxr lint` or `doctor`.** Same reason: the field is the store's, and checking it would make the packaged template names part of the note schema.
- **Touching notes already written.** contexture never edits note frontmatter outside a command's own contract. Existing Concept notes keep whatever tags they have.
- **Naming the key in a spec.** The project rule names a frontmatter key in a spec only when a specification depends on it. Nothing does, and the field stays the store's.

## Impact

- `templates/notes/Concept.md`: `tags: []` becomes a block sequence naming `Concept`.
- `templates/agents/canonical.md`: two sentences in "Note templates".
- `test/unit/note-templates.test.ts`: the base carries an empty list, and every other packaged template names exactly its own kind.
- `test/unit/agents-doc.test.ts`: the canonical-section golden.
- Stores receive both on their next `ctxr update`: the template is refreshed unconditionally and the canonical section is re-rendered. No configuration or migration.
