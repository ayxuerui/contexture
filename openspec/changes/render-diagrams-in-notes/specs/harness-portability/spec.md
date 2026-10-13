## ADDED Requirements

### Requirement: The explanation skill says when a diagram fits and how to draw it on each surface
The rendered `ctxr-explanation` skill SHALL carry a section on diagrams. The section SHALL state that an agent draws a
diagram when the content is a structure, a flow, a sequence, a set of relationships, or a before/after that sentences
or bullets would flatten, and that a diagram SHALL NOT restate what a list already says. It SHALL state that a diagram
is kept small enough to read as text. It SHALL state the diagram's form on each surface:
- in a note, a pull request body, or a conversation answer, a fenced `mermaid` block, which stays reviewable as text
  in a diff, rather than an image or hand-written SVG;
- in a published page, a diagram drawn in the page's own HTML or inline SVG, with no renderer script and no external
  network address, so the page stays self-contained.

The section SHALL apply to notes even though the rest of the skill scopes notes out. The enforcing mechanism is the
test over the rendered skill set.

#### Scenario: The skill states when a diagram fits
- **WHEN** the explanation skill is rendered for a store
- **THEN** its diagrams section names structure, flow, sequence, relationships, and before/after as what a diagram is
  for, and says a diagram does not restate a list

#### Scenario: The skill names a mermaid block for notes, pull requests and answers
- **WHEN** the explanation skill is rendered for a store
- **THEN** its diagrams section names a fenced `mermaid` block as the form in a note, a pull request body, and a
  conversation answer

#### Scenario: The skill keeps a published page self-contained
- **WHEN** the explanation skill is rendered for a store
- **THEN** its diagrams section tells the agent to draw a published page's diagram in the page's own HTML or inline SVG,
  and to reference no renderer script and no external address

#### Scenario: The diagrams section passes the shipped-skill guards
- **WHEN** the rendered skill set is checked by the test over shipped skills
- **THEN** the diagrams section contains none of the banned tier words, and every flag it names binds to a registered
  command
