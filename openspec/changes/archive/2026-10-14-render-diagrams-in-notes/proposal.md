## Why

A diagram is often faster to take in than the prose that describes the same structure. Karpathy's advice for working
with an LLM is "instead of writing, ask your LLM to create a diagram". Agents in a store explain things to the operator
all day, in answers, pull requests, pages and notes, and they explain almost entirely in sentences and bullets. Nothing
tells them when a diagram would serve the reader better, or what form it should take on each surface.

The ask is for agents to draw a diagram whenever one fits. Two things stand in the way:
- **No guidance.** No shipped convention tells an agent when a diagram fits, or what form it takes on each surface.
- **No rendering in `serve`.** `ctxr serve` renders notes with plain markdown-it, so a diagram written in a note shows
  up as a code block of source. The reader gets the syntax and not the picture.

The sibling change `review-the-knowledge-diff` also emits a graph delta as a diagram, and needs the same rendering.

## What Changes

- **Agents draw a diagram when it fits.** The baseline "## Explaining" section that `explain-in-controlled-english`
  adds carries one sentence, owned and delivered by that change:
  > Draw a diagram when structure, flow or sequence would take a paragraph: fenced `mermaid` in notes, pull requests
  > and answers; inline SVG in pages.

  The section is inlined into every entry document, so the sentence reaches every turn, including an agent writing a
  note outside any skill. A fenced `mermaid` block is drawn natively by GitHub (including in a pull request's rich
  diff) and Obsidian, and, after this change, by `ctxr serve`, and a diff reviews it as text. A published page is
  self-contained and served byte-verbatim, so it draws its diagram as inline SVG in its own markup.
- **`ctxr serve` draws mermaid blocks, as progressive enhancement.** This supports the guidance for notes:
  - The server renders a mermaid block as a source block marked as a diagram. With scripting disabled, the reader
    sees the readable source text, which carries the whole diagram's content.
  - With scripting enabled, a renderer that `ctxr` serves from its own installed package, at a route on its own
    server, replaces the source with the drawn diagram. No CDN and no external network address is involved.
  - The drawn diagram follows the shell's light, dark, or system theme.
  - The renderer is loaded only on pages that contain a diagram.
  - A block the renderer cannot parse stays visible as source and is marked as not drawn. It is never dropped.
  - This applies to every document `serve` renders through markdown: notes, catalog sections, and the graph document.
- **`@mermaid-js/tiny` becomes a runtime dependency.** It is the official zero-dependency single-file build, released
  in lockstep with `mermaid` and kept current by the npm Dependabot ecosystem that `keep-external-dependencies-current`
  already declares.
- **BREAKING**: None. A note without a mermaid block renders byte-identically to today, the entry document does not
  change, and no command, flag, or configuration key changes.

**Depends on `explain-in-controlled-english`**, which owns the guidance sentence and the ceiling increase (8,500 to
8,900 bytes) that pays for its section. This change ships no prose of its own.

## Non-goals

- **Rendering in published pages.** Pages are in scope for the guidance, not for `serve`'s renderer. A page stays
  self-contained and is served byte-verbatim, and `ctxr publish check` refuses any external reference, so a page draws
  its own diagram in its own markup. Injecting a renderer into a page would break the byte-verbatim guarantee that
  previews depend on.
- **Guidance prose of its own.** The one sentence lives in the sibling's "Explaining" section, and its bytes are
  counted there. A fuller section in a skill was considered and rejected (design.md D1).
- **Server-side rendering.** It is rejected for now, not forever: design.md D3 sets out the strongest case for it and
  what would flip the decision. The engine GitHub uses needs a headless browser to render on a server. The one mature
  DOM-free renderer re-implements the grammar for a subset of diagram types.
- **Other diagram languages (Graphviz, D2, PlantUML) and hand-written inline SVG in notes.** See design.md D2. A fenced
  block in any other language stays an ordinary code block.
- **A configuration key to turn diagrams off.** A store that never writes a mermaid block never loads the renderer, so
  there is nothing to opt out of. An opt-in key would be a default nobody needs to change.
- **Diagram linting or a `ctxr` check that a diagram parses.** A parse failure is visible on the page and on GitHub.
  A CLI check would need the renderer to run in Node, which is the same headless-browser problem as server-side
  rendering.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `context-browsing`: adds a requirement that a mermaid block in a rendered document is drawn by a renderer the
  server serves itself. Without scripting the block is readable source, and it follows the chosen theme. The existing
  no-script theme and navigation requirements, and the byte-verbatim published-page requirements, are unchanged. The
  new requirement states how a page may use script without weakening them.

## Impact

- `package.json`: `@mermaid-js/tiny` added to `dependencies`, pinned to the same caret range style as the others.
- `src/core/browse/render.ts`: a fence rule that renders a `mermaid` info-string block as a marked diagram source
  block, and a way for callers to know whether a body contains one.
- `src/core/browse/templates.ts` and `templates/serve/shell.html`: a slot for the page's script references, filled
  only when the body contains a diagram.
- `src/commands/serve.ts`: two asset routes, the renderer and the small page script, answered ahead of the route
  table like the stylesheet.
- `templates/serve/diagrams.mjs` (new): the page script that loads the renderer, maps the shell theme to diagram
  colors, draws each block, and marks the ones that fail.
- `templates/serve/style.css`: styling for diagram blocks, drawn and undrawn, in both palettes.
- Tests: `test/unit/browse-render.test.ts`, `test/unit/browse-templates.test.ts`,
  `test/integration/serve-command.test.ts`, and a new unit test for the theme mapping in `diagrams.mjs`.
- Package footprint: the published tarball is unchanged in size. An install pulls one more package, about 2.8 MB
  unpacked with no transitive dependencies. The full `mermaid` package is about 122 MB unpacked on its own, plus 23
  direct dependencies.
- Downstream: stores need no change. The guidance sentence arrives with the sibling's baseline section through
  `ctxr update`. Diagrams already in notes start drawing once the operator upgrades `ctxr`.
