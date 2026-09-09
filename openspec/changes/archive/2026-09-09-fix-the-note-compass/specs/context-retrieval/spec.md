## MODIFIED Requirements

### Requirement: Relation sections yield typed edges
contexture SHALL define one fixed relation vocabulary, identical in every store and not configurable. A wikilink inside a section whose heading text — trimmed, trailing colon removed, compared case-insensitively — equals a vocabulary name SHALL be recorded as an edge of that type; the section ends at the next heading of the same or a higher level. Every other wikilink SHALL be recorded as an untyped link, which is what a heading outside the vocabulary yields.

Each name SHALL carry a definition stating when to use it and how it differs from its neighbours, because a name alone does not tell an agent which of two adjacent relations a link belongs under. This requirement is the only place the vocabulary and its definitions are enumerated; no other requirement may name a relation.

- **Upstream** — the thinking this note is built on: prior ideas, sources, and decisions that had to exist first. If removing the linked note would leave this one unfounded, it is upstream.
- **Downstream** — what follows from this note: what it enables, informs, or raises. The inverse of Upstream.
- **Similar** — a note this one resembles in structure, pattern, or topic, where neither depends on the other. Use it when the observation is that the two rhyme, not that one caused the other.
- **Opposing** — a note that contradicts this one, or that holds under conditions where this one fails. The tension is the content; record it rather than resolving it by dropping a side.

Edges SHALL remain directed and recorded only from the note that carries the link: naming a note Upstream SHALL NOT cause the reciprocal Downstream edge to be recorded on it, and every shipped artifact that explains the vocabulary SHALL say so, since an agent that assumes reciprocity will leave half the graph unwritten.

Every shipped artifact that names the vocabulary SHALL render the definitions from the same source as the names — at minimum the generated entry document, the skill that groups link proposals by relation, and the note template carrying the sections — so a definition cannot drift from the name it explains.

#### Scenario: A link under a vocabulary heading is typed
- **WHEN** a note has a section headed with a vocabulary name followed by `[[Other]]` before the next heading
- **THEN** the edge to `Other` has that name as its type

#### Scenario: A link after the section closes is untyped
- **WHEN** the same note has a `## Notes` heading after that section followed by `[[Third]]`
- **THEN** the edge to `Third` has the untyped link type

#### Scenario: Empty vocabulary changes nothing
- **WHEN** a store carries a note whose only headings are outside the vocabulary
- **THEN** every edge it yields is untyped, exactly as before this capability existed

#### Scenario: Typed edges need no configuration
- **WHEN** a store initialized on the default configuration builds its graph over a note using a vocabulary heading
- **THEN** the edge is typed, and no configuration key had to be declared to make it so

#### Scenario: The vocabulary is not configurable
- **WHEN** a store's configuration declares a relation vocabulary key
- **THEN** that key is unrecognized and the store fails the configuration-integrity check naming it, rather than the declared names taking effect
