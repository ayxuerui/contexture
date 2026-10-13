## 1. Dependency and asset routes

- [ ] 1.1 Add `@mermaid-js/tiny` to `dependencies` in `package.json` with a caret range on the current release, and run `npm install` to update the lockfile. Confirm `npm ls @mermaid-js/tiny` lists exactly one copy with no dependencies of its own.
- [ ] 1.2 Add a small module in `src/core/browse/` that resolves the installed renderer with `createRequire(import.meta.url)`. It should return the absolute path of `dist/mermaid.tiny.js` and the version from the dependency's `package.json`, read once and memoized. Export the route path `/assets/mermaid/<version>/mermaid.tiny.js` from that module, so the shell and the router build it from one place (design.md D6).
- [ ] 1.3 In `src/commands/serve.ts`, ahead of `buildRouteTable` beside the stylesheet branch, answer the renderer route with the file's bytes, a JavaScript content type, and `Cache-Control: public, max-age=31536000, immutable`. Answer `/assets/diagrams.mjs` from `templates/serve/diagrams.mjs` with a JavaScript content type and no cache header. A renderer path naming any other version is a `404`.
- [ ] 1.4 Tests in `test/integration/serve-command.test.ts`, for the scenarios "The renderer is served from the installed package" and "An asset request reads no store content":
  - The renderer route returns `200`, a JavaScript content type, and a body byte-identical to the resolved file.
  - A wrong version segment returns `404`.
  - `/assets/diagrams.mjs` returns `200`.
  - Both asset routes answer when the store root's notes directory is unreadable.
- [ ] 1.5 Run `npx vitest run test/integration/serve-command.test.ts` and confirm it exits 0.

## 2. Rendering the block

- [ ] 2.1 In `src/core/browse/render.ts`, override the `fence` renderer rule (design.md D5). An info string whose first whitespace-separated word is `mermaid` emits `<pre class="ctxr-diagram"><code>` followed by the source escaped with `escapeHtml`. Every other fence goes to the default rule. Keep `html: false`.
- [ ] 2.2 Make the render function report whether it emitted a diagram block, as a returned value set by the fence rule (for example `{ html, hasDiagram }`), not by searching the produced HTML. Update the callers in `serve.ts` for notes, catalog sections, and the graph document.
- [ ] 2.3 Tests in `test/unit/browse-render.test.ts`:
  - A `mermaid` fence renders as the marked block with its source intact apart from escaping.
  - A fence whose source contains `<script>` and `&` is escaped.
  - `mermaid` with trailing info words still matches.
  - `dot`, `d2`, `plantuml`, an unlabelled fence, and an indented code block render byte-identically to the output before this change; capture that output from the current renderer in the test.
  - A body quoting the text `ctxr-diagram` inside an ordinary code block reports no diagram.
  - A note with no fences renders byte-identically to before.
- [ ] 2.4 Run `npx vitest run test/unit/browse-render.test.ts test/unit/notes-render.test.ts` and confirm it exits 0.

## 3. Shell slot and page script

- [ ] 3.1 Add a `{{SCRIPTS}}` slot at the end of `<body>` in `templates/serve/shell.html`. `renderShell` in `src/core/browse/templates.ts` fills it, through a replacer function like every other slot, with the two script references (the renderer route as a classic `defer` script, then `/assets/diagrams.mjs` as `type="module"`) when the body has a diagram, and with the empty string otherwise.
- [ ] 3.2 Write `templates/serve/diagrams.mjs` (design.md D6 and D7):
  - Export a pure `effectiveScheme(themeAttr, prefersDark)` returning `light` or `dark`, and a pure `themeVariables(readProperty)` mapping the `--ctxr-*` custom properties to mermaid `themeVariables`.
  - On load: keep each `.ctxr-diagram` block's source from `textContent`, then initialize mermaid with `startOnLoad: false`, `securityLevel: 'strict'`, `theme: 'base'`, and the derived variables.
  - Draw each block on its own. A block that throws keeps its source visible and gains a `data-ctxr-diagram-error` attribute with the message, and the remaining blocks are still drawn.
  - When the theme attribute is `system`, listen for changes to `prefers-color-scheme` and redraw every block from its kept source.
  - Register no icon loader and fetch nothing.
- [ ] 3.3 In `templates/serve/style.css`, style `.ctxr-diagram` both undrawn (the source block, using the existing code palette) and drawn (centered, scrolling horizontally when wide), and give the error state a visible label using `--ctxr-broken`, in both palettes.
- [ ] 3.4 Tests:
  - In `test/unit/browse-templates.test.ts`, the slot holds the two references in order when a diagram is present and is empty otherwise, and every `src`/`href` in a rendered shell, with and without a diagram, starts with `/` or `?` and never `http://` or `https://`.
  - A new `test/unit/serve-diagrams-script.test.ts` imports `templates/serve/diagrams.mjs` and covers `effectiveScheme` for `light`, `dark`, and `system` with each `prefersDark` value, including `light` under a dark preference, and covers `themeVariables` for both palettes' property values.
- [ ] 3.5 In `test/integration/serve-command.test.ts`, cover the scenarios "With scripting disabled the diagram's source is readable", "A page with no diagram loads no renderer", "The graph document and catalog draw diagrams the same way", "A page with a diagram names no external address", and "Theme and navigation still work without script on a page with a diagram":
  - Serve a fixture store whose note, graph document, and catalog section contain a `mermaid` block, and check each response for the marked block and both script references.
  - Check that a note without a block, and the index, reference no script.
  - Check that a `?ctxr-theme=dark` request and a `?ctxr-nav=collapsed` request on the diagram note set their cookies and attributes exactly as on a note without one.
- [ ] 3.6 Also in `test/integration/serve-command.test.ts`, for "A published page carrying a mermaid block is still served byte-verbatim": place a published page and a session-worktree preview page whose `index.html` contains a ```` ```mermaid ```` block. Assert that both responses are byte-identical to the files on disk and contain no `ctxr-diagram` and no `<script` the file did not already contain.
- [ ] 3.7 Run `npx vitest run test/unit/browse-templates.test.ts test/unit/serve-diagrams-script.test.ts test/integration/serve-command.test.ts` and confirm it exits 0.

## 4. Guidance (delivered by the sibling)

- [ ] 4.1 This change adds no guidance prose and no guidance test: the diagram sentence, its assertion, and the ceiling increase to 8,900 bytes belong to `explain-in-controlled-english` (design.md D1). Before marking this change done, confirm that change has landed by running `grep -F "Draw a diagram when structure, flow or sequence" templates/conventions/baseline-conventions.md`, which must print one line. Do not edit `templates/conventions/baseline-conventions.md` from this change.

## 5. End to end

- [ ] 5.1 Run `npm run typecheck && npm test` and confirm both exit 0.
- [ ] 5.2 Run `npm run build`, initialize a scratch store with `node dist/bin.js init --harness none`, and add a note with one valid flowchart, one sequence diagram, and one deliberately malformed `mermaid` block. Then start `node dist/bin.js serve --json`. In Chrome through the devtools tools, open the note and record the output of each check below:
  - with scripting enabled, `document.querySelectorAll('.ctxr-diagram svg').length` is `2` and one block carries `data-ctxr-diagram-error`;
  - the network request list contains no request to any origin but the served one;
  - after `?ctxr-theme=dark`, the computed fill of a node differs from the light-theme value and the label text is legible against the background;
  - under `?ctxr-theme=system`, emulating `prefers-color-scheme: dark` redraws the diagram in the dark palette without a reload;
  - with JavaScript disabled through emulation, the three blocks show their source text and the theme and navigation links still work.
- [ ] 5.3 Run `npm pack --dry-run` and confirm the tarball still lists `templates/serve/diagrams.mjs` and does not include the renderer file itself, which is installed as a dependency and not packed.
- [ ] 5.4 Run `openspec validate render-diagrams-in-notes --strict` and confirm it exits 0.
