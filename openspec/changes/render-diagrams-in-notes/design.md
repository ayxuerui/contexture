## Context

See proposal.md, Why. The current state that shapes the approach:

- **One render path.** `src/core/browse/render.ts` builds a markdown-it instance (`html: false`, `linkify: true`) with
  one inline rule for wikilinks. `serve.ts` renders notes, catalog sections, and the graph document through the same
  `renderNoteBody`, so one fence rule there covers all three.
- **The shell has no script, by requirement.** The context-browsing requirements say theme choice and navigation
  show/hide/collapse work "without any client-side script". They do not say a page carries no script. The navigation
  uses a checkbox and a cookie-backed link, and the theme uses a cookie the server reads on each request. The
  stylesheet is one route, `/assets/style.css`, answered before the route table is built.
- **Published pages are served byte-verbatim** under both the publish route and the preview route, and
  `ctxr publish check` fails a page that references any `http://` or `https://` address.
- **Dependencies are watched.** `keep-external-dependencies-current` declared the npm Dependabot ecosystem. Minors
  and patches are grouped weekly, and majors arrive as their own pull requests. Vendored content under
  `templates/vendor/` is watched by a separate script that only knows how to fetch skills from `anthropics/skills`.
- **The entry document has a budget.** The baseline conventions are inlined into `AGENTS.md`. A test holds
  contexture's generated share under a ceiling (`CONTEXTURE_OWNED_CEILING_BYTES`, 8,500 bytes), and `doctor` fails a
  store whose `AGENTS.md` exceeds 24,000 bytes (Antigravity's limit).
- **Explaining gets a baseline section, once `explain-in-controlled-english` lands.** That change adds
  "## Explaining" to the baseline conventions, inlined into every entry document. It carries the controlled-English
  rules for every explanation an agent writes for the operator, and it raises the contexture-owned ceiling from 8,500
  to 8,900 bytes to pay for them.

What the npm registry offers for mermaid, checked on 2026-10-13 with `npm view` and the downloads API:

| Package | Version / last publish | Unpacked | Deps | Weekly downloads | What it is |
|---|---|---:|---:|---:|---|
| `mermaid` | 12.2.0 / 2026-10-13 | 122 MB | 23 | 18.5 M | The engine GitHub uses. `dist/mermaid.min.js` is 5.5 MB (1.57 MB gzipped). Needs a DOM. |
| `@mermaid-js/tiny` | 12.2.0 / 2026-10-13 | 2.8 MB | 0 | 3.6 k | Official single-file build, released in lockstep. `mermaid.tiny.js` is 2.8 MB (0.75 MB gzipped). Lacks mindmap, architecture, KaTeX, and lazy loading. Its README says it is "designed to be used via CDN". |
| `@mermaid-js/mermaid-cli` | 12.0.0 / 2026-09-24 | 84 KB | 10 | | Server-side rendering via a peer dependency on `puppeteer` ^25, which downloads Chromium. |
| `mermaid-isomorphic` | 3.1.0 / 2026-02-19 | 46 KB | 3 | 593 k | Server-side rendering via a peer dependency on `playwright`. Still on `mermaid` ^11. |
| `beautiful-mermaid` | 1.1.3 / 2026-02-26 | 2.1 MB | 2 | 546 k | DOM-free renderer to SVG or ASCII with its own parser. Six diagram types (flowchart, state, sequence, class, ER, XY chart). Theming through CSS custom properties. |
| `mermaid-ssr` | 2023-10 | 17.7 MB | 8 | | A fork pinned to d3 v5, abandoned. |
| `markdown-it-mermaid` | 0.2.5 / 2022-06 | | 1 | | Depends on `mermaid` ^7, abandoned. |

## Goals / Non-Goals

**Goals:**
- An agent draws a diagram whenever one fits, in notes, pull requests, answers and pages, prompted by a rule it reads
  on every turn.
- One source text per diagram, drawn in `ctxr serve`, in GitHub and in Obsidian.
- With scripting disabled, a page loses nothing but the drawing, and the theme and navigation still work.
- No byte of a served page comes from outside the server, and no request leaves it.
- The renderer stays current through the dependency process the repository already runs.

**Non-Goals:** see proposal.md. At the design level, this change also:
- adds no diagram rendering to `ctxr publish`, to page templates, or to the publish or preview routes (a page draws its own diagram as inline SVG, per D1);
- makes no attempt to make mermaid's layout match GitHub's pixel for pixel;
- adds no server-side cache of drawn diagrams.

## Decisions

### D1. The guidance is one sentence in the baseline's "Explaining" section

The point of this change is that an agent draws a diagram when one fits. Rendering in `serve` supports that goal but
is not the goal itself. The deciding question is where the "when a diagram fits" judgment lives.

Choosing a diagram over sentences is the same judgment as choosing the sentences' shape: how to explain this to this
reader. So the guidance is one sentence in the "## Explaining" baseline section that `explain-in-controlled-english`
adds. That change owns the sentence and delivers it verbatim:

> Draw a diagram when structure, flow or sequence would take a paragraph: fenced `mermaid` in notes, pull requests and
> answers; inline SVG in pages.

It covers both halves: when (structure, flow or sequence that would take a paragraph) and the form on each surface.
- **Notes, pull requests, answers:** a fenced `mermaid` block (D2). GitHub, Obsidian and `ctxr serve` draw it, and a
  diff reviews it as text.
- **Published pages:** inline SVG in the page's own markup. A page is self-contained, served byte-verbatim, and
  refused by `ctxr publish check` if it names an external address.

The section is inlined into the entry document, so it reaches every turn, including an agent writing a note outside
any skill. The bytes are carried by the sibling change, which raises contexture's owned-prose ceiling from 8,500 to
8,900. This change adds no shipped prose of its own, and depends on `explain-in-controlled-english` landing first.

**The case for a fuller section in a skill.** One sentence leaves out most of what makes a diagram good:
- which mermaid type fits which content (flowchart for flow, `sequenceDiagram` for exchanges, `stateDiagram` for
  lifecycles);
- a before/after shown as two diagrams;
- how large is too large;
- an example of a list that should stay a list.

A skill has room for all of that at no every-turn cost. A skill is also the house pattern for guidance that matters on
some turns (`lean-composed-entry-document`).
**Why one baseline sentence wins:**
- The operator decided that the explanation rules are every-turn rules and belong in the entry document, not in a
  skill. That decision removed the `ctxr-explanation` skill this change's previous draft added a section to.
- A skill fires only when its trigger is recognized. Writing a note, an answer or a pull request body happens on most
  turns and outside any one skill. A trigger like "about to explain something with structure" is exactly the kind an
  agent fails to recognize, so the guidance would not fire in the moments it is for.
- Models already know mermaid's diagram types. What they lack is the prompt to reach for one, and the rule for which
  form each surface takes. One sentence carries both.

**What would flip it:**
- Diagrams drawn where a list would do, or diagrams too large to read. Either means the sentence needs the detail
  that only a skill has room for. The fix is an on-demand guidance document or a skill section that the baseline
  sentence points to, keeping the sentence as the trigger.
- Agents still not drawing where a diagram plainly fits. That would show the sentence is too weak as written, and the
  first remedy is sharper wording in the baseline, not more text elsewhere.

**The case for a skill as the only home** (the decision the operator reversed). It costs no entry-document bytes, and
it keeps the 24,000-byte limit's headroom for the operator's own conventions.
**Why not:** the operator's decision is that every-turn rules go in the entry document. The sibling pays 400 bytes of
ceiling for the whole "Explaining" section, of which this sentence is about 150.

### D2. Diagrams are fenced `mermaid` blocks

The reviewer of a store's change reads it on GitHub, and GitHub renders a fenced `mermaid` block as a diagram in a
markdown file view and in a pull request's rich diff. Obsidian renders it too, and so do VS Code's markdown preview
(with an extension) and many other markdown tools. The same text that `serve` draws is also what the reviewer sees
drawn, and what the diff shows line by line when it changes. Models write mermaid fluently, because it is common in
their training data.

**The case for hand-written inline SVG.** It needs no runtime at all, it gives the author exact control over layout,
and it is the only format that renders identically everywhere it is rendered. It already works in published pages,
which are self-contained HTML. A store that wanted diagrams with zero new dependencies could have them today.
**Why not:**
- Passing note-authored SVG through to the page means allowing raw markup, and markdown-it runs with `html: false`
  for a reason. SVG can carry script, event handlers, and external references, so it would need a sanitizer, and the
  sanitizer would be a new dependency anyway.
- A coordinate-level SVG diff is unreviewable: moving one box rewrites dozens of numbers.
- Models draw SVG badly. They overlap labels and misjudge text width, because they lay out without measuring.
- GitHub does not render inline SVG in markdown; it renders an SVG only as a separate image file.

**What would flip it:** none of the above for notes. For published pages, inline SVG is already the right answer, and
the sibling change `two-kinds-of-published-page` owns it.

**The case for Graphviz, D2, or PlantUML.** Their layout engines are better than mermaid's on dense graphs. Graphviz's
`dot` in particular is the reference for directed-graph layout, and D2 has the most readable source syntax of the four.
A graph-delta view with hundreds of nodes is exactly where mermaid's layout degrades.
**Why not:**
- Each needs a native binary (`dot`, `d2`) or a JVM (PlantUML) on the machine that renders it. That means adding it to
  the one image every harness shares, and to every operator laptop.
- GitHub renders none of them, so the reviewer would see source text where mermaid shows a picture.
- Graphviz does have WASM builds, which would remove the native-binary objection for `dot` alone. GitHub still would
  not render it.

**What would flip it:** GitHub rendering one of them natively, or the sibling graph-delta view proving that mermaid's
layout is unreadable at the sizes it actually emits. In the second case the answer is a separate decision for that view
only. A fenced block in another language already renders as an ordinary code block, so nothing here forecloses it.

### D3. Draw in the browser, as progressive enhancement, not on the server

The server emits each mermaid block as escaped source inside a marked block (D5). A page that contains one also
references two scripts served by `ctxr` itself: the renderer and a small page script. With scripting disabled, the
reader sees the source, which carries everything the diagram says: the nodes, the edges, and the labels. With
scripting enabled, the page script replaces the source with the drawing.

This resolves the tension with the shell's no-script stance rather than weakening it. The existing requirements make
specific promises: theme and navigation work without script. None of them is touched, and the new requirement says so
explicitly, as a rule that holds for any future script: script only enhances. What the reader loses without script is
the drawing alone, and the drawing is a rendering of text they can still read.

**The case for server-side rendering.** It keeps the no-script property total, not just for theme and navigation:
every page is complete HTML, with no 0.75 MB script download and no flash of source before the drawing appears. The
output is deterministic and testable in vitest without a browser, and a test could assert on the SVG itself. It would
also let `ctxr` check that a diagram parses, because the renderer would run in Node.

`beautiful-mermaid` is the strongest form of this option, and it is real:
- it renders to SVG with no DOM;
- it has 546 k weekly downloads;
- it themes through CSS custom properties, so the drawn SVG would follow the shell's `--ctxr-*` palette by the
  cascade, with no script at all;
- its six diagram types (flowchart, sequence, state, class, ER, and XY chart) cover the structure, flow and sequence
  that the guidance (D1) points agents at.

The other server-side routes are not viable for this repository. `@mermaid-js/mermaid-cli` and `mermaid-isomorphic`
both drive a headless Chromium (through `puppeteer` and `playwright`). That means a browser download inside a CLI
that is deliberately small, and a browser in the one image every harness shares.

**Why not, today:**
- **Fidelity is the point of D2, and a re-implemented parser gives it up.** `beautiful-mermaid` parses mermaid with its
  own grammar, not mermaid's. A block that GitHub draws could fail in `serve`, or draw differently, and the reverse
  is also possible. The argument for mermaid was "one source, drawn the same wherever it is read". A second parser
  makes `serve` the place where that stops being true.
- **Coverage.** Gantt, pie, timeline, gitGraph, mindmap, and quadrant charts would render as source in `serve` and as
  drawings on GitHub. That inconsistency is worse than consistently drawing them in the browser.
- **Maintenance.** It went from 0.1.0 to 1.1.3 in four weeks and has published nothing since 2026-02-26, about seven
  and a half months. `mermaid` released 12.2.0 today. Putting every note's diagram through a young parser with a
  paused release cadence is a bet against the dependency-currency policy rather than one served by it.

**What would flip it:**
- a spike showing `beautiful-mermaid` draws a corpus of real store diagrams, plus mermaid's own documentation
  examples for its six types, with the same nodes, edges, and labels as `mermaid` does, combined with resumed
  releases; or
- the mermaid project shipping a DOM-free renderer of its own, which removes both the fidelity and the maintenance
  objections at once.

Either flip modifies the first new requirement's no-script scenario from "source is readable" to "the diagram is
drawn", and deletes the page script. The marked-block markup (D5) is the seam that makes the swap local to
`render.ts`.

**The case for doing nothing in `serve`** (show the source, styled). It adds no dependency and no script, and GitHub
already draws the diagram for the reviewer.
**Why not:** `serve` is the operator's own reading surface for their store. A diagram that renders on GitHub but not
in the tool built to read the store sends the reader somewhere else to read their own notes.

### D4. Depend on `@mermaid-js/tiny`, not on `mermaid`, and do not vendor the file

`ctxr` serves `dist/mermaid.tiny.js`, resolved from the installed dependency at startup. It does not copy the file
into `templates/`.

**The case for the full `mermaid` package.** It is the package the mermaid project recommends for npm use. It
supports every diagram type, including mindmap and architecture, plus KaTeX in labels. It has 5,000 times the
downloads, so its packaging is the better-trodden path.
**Why not:**
- Installing it pulls 122 MB unpacked for the package alone, plus 23 direct dependencies (d3, cytoscape, katex, elkjs, chevrotain, and
  more) into a CLI whose own package is 1.6 MB. All of that would exist only to serve one browser file.
- Its single-file browser build, `mermaid.min.js`, is 5.5 MB (1.57 MB gzipped), about twice the tiny build.
- Its ESM build lazy-loads 550 chunk files, which `serve` would have to route individually.

**What would flip it:** notes in a real store using mindmap or architecture diagrams, which tiny shows as undrawn
source. The swap is one dependency line and one resolved path.

**The case for vendoring the file** into `templates/vendor/` with a provenance record, like the vendored skills.
Nothing is fetched at install time, and the shipped bytes are fixed and reviewable in this repository.
**Why not:** the vendoring script only knows how to fetch skills from `anthropics/skills` through `gh api`, and
Dependabot does not see vendored files. Vendoring would put the renderer outside the one currency mechanism that
already works for npm packages, against the reason that mechanism was built. It would also add a 2.8 MB minified file
to the git history on every bump.

**On tiny's "designed for CDN" note:** the package is built and published by the mermaid project in lockstep with
`mermaid` (both were at 12.2.0 on the same day), with no dependencies and a plain `main`. The note warns that tiny does
not lazy-load, which does not matter here. The residual risk is that the project stops publishing tiny to npm; see
Risks.

### D5. A fence rule emits a marked source block

`render.ts` overrides markdown-it's `fence` renderer rule. When the info string's first word is `mermaid`, it emits
`<pre class="ctxr-diagram"><code>` followed by the escaped source; any other fence falls through to the default rule
unchanged. The source is HTML-escaped by the same `escapeHtml` the wikilink rule uses, and `html: false` stays. The
page script reads the source back with `textContent`, so what reaches mermaid is exactly the author's text. The
mermaid configuration uses `securityLevel: 'strict'`, which disables click handlers, and `htmlLabels: false` at the
top level, which draws every label as SVG text.

`strict` alone is not enough. Measured in Chromium against `@mermaid-js/tiny` 12.2.0 during implementation:
- With `strict` and no other setting, a flowchart label's HTML is rendered: `<b>` draws bold, and an `<img>` is kept.
  A label `A["<img src=https://example.invalid/pixel.png> hi"]` made the browser request that address.
- The nested form, `flowchart: { htmlLabels: false }`, does not help: the `<b>` and `<img>` elements are still created.
- The top-level `htmlLabels: false` blocks it: the same label made no request, and `<b>` and `<img>` show as literal
  text.

**The trade-off.** Labels lose HTML formatting, so `<b>` or `<br>` in a label is shown as text rather than applied.
mermaid still removes some markup outright: `<script>…</script>` in a label disappears rather than showing as text.
The guarantee is therefore that markup in a diagram's source is never rendered as markup and never loads or runs
anything; it is shown as text or removed. Sequence-diagram messages were already shown as literal text without the
setting.

The render function also reports whether it emitted any diagram block, so the shell can decide whether to reference
the scripts (D6). It reports this as a value the renderer returns, not by searching the produced HTML for the class
name, which a code block quoting `ctxr-diagram` would match.

**Alternative:** use a markdown-it plugin such as `markdown-it-mermaid`. It is abandoned (2022, mermaid ^7) and renders
on the server by calling mermaid in Node, which fails without a DOM.

### D6. Script loads only where a diagram is, from versioned local routes

The shell gains one slot for script references, filled only when the rendered body contains a diagram block. It
references two scripts:
- `/assets/mermaid/<version>/mermaid.tiny.js`, a classic deferred script that defines `window.mermaid`;
- `/assets/diagrams.mjs`, a module script that runs after it, because deferred classic scripts and module scripts
  execute in document order.

Both routes are answered ahead of `buildRouteTable`, as the stylesheet is, so they read no store content. The
renderer's URL carries the installed version, read once from the dependency's `package.json`, and is served with
`Cache-Control: public, max-age=31536000, immutable`. An upgrade changes the URL, so a browser can never hold a stale
renderer, and the 2.8 MB file is fetched once rather than on every page. The page script and stylesheet keep today's
uncached behaviour, because they change whenever `ctxr` does.

**Alternative:** reference the renderer on every shell page. That is simpler, with no slot and no detection, but it
costs 2.8 MB of parsing on pages that contain no diagram, which is most of them.

**Alternative:** inline the page script into the shell. It is small, but serving it as a file keeps `shell.html` free
of script, which keeps "the shell is markup" true by inspection. It also lets a unit test import the theme-mapping
function directly.

### D7. The drawn diagram takes its colors from the shell's own palette

`diagrams.mjs` resolves the effective scheme from `html[data-ctxr-theme]`, which the server already set from the
reader's choice. `light` and `dark` are taken as they are. `system` is resolved with
`matchMedia('(prefers-color-scheme: dark)')`, and the script listens for changes to it. The script then reads the
`--ctxr-fg`, `--ctxr-bg`, `--ctxr-border`, `--ctxr-code-bg`, and `--ctxr-muted` custom properties from the computed
style, and initializes mermaid with `theme: 'base'` and `themeVariables` derived from them. The palette therefore has
one source, `style.css`, and a future palette change reaches diagrams with no script change.

When the system preference changes, every drawn diagram is drawn again from its kept source. The theme-link choices
need no handling: each one is a full page load.

The mapping from custom-property values to `themeVariables` is a pure exported function, so a unit test can cover it
without a DOM.

**Alternative:** use mermaid's built-in `default` and `dark` themes. That needs fewer lines, but the colors come from
mermaid's palette, not the shell's. It would also give the shell a second hard-coded notion of light and dark that can
drift from `style.css`.

## Risks / Trade-offs

- **The mermaid project could stop publishing `@mermaid-js/tiny` to npm**, given its CDN-oriented README. →
  Dependabot would then simply raise no further updates, which looks the same as no releases. The failure mode is
  staleness, not breakage: an installed version keeps working. Comparing `npm view @mermaid-js/tiny version` with
  `npm view mermaid version` shows the gap at any time, and the fix is D4's flip to the full package, one dependency
  line and one resolved path.
- **The 2.8 MB renderer on a page.** → It is loaded only on pages with a diagram, over loopback by default, and cached
  immutably by version. Pages without a diagram are byte-identical to today.
- **A mermaid major can change syntax or output.** → Majors are ungrouped in Dependabot, so each arrives as its own pull
  request with its own CI run. The render tests pin the markup contract, not mermaid's SVG.
- **The diagram in `serve` and the diagram on GitHub can differ in layout**, because GitHub runs its own mermaid
  version. → Accepted. The source is identical, and D2's promise is "drawn from the same text", not "pixel-identical".
- **Diagram content is note content, run through a renderer in the reader's browser.** → The source is escaped in the
  HTML, read back as text, and rendered at `securityLevel: 'strict'` with `htmlLabels: false`, so markup in a label
  is shown as text or removed, and click handlers are disabled (D5 records why `strict` alone is not enough). mermaid
  also sanitizes its output with DOMPurify. A note is the operator's own content, and the
  threat model is the same as for any markdown the store holds.
- **A diagram could carry an icon reference that fetches remotely.** → tiny registers no remote icon loader by default,
  and the page script registers none. The no-outside-request scenario is checked in a real browser in tasks.md.
- **Large graph diagrams lay out poorly in mermaid.** → This is the sibling `review-the-knowledge-diff` change's
  concern, and its size limit belongs there. D2 names what would move that one view to another engine.
- **One sentence may be too little guidance.** → D1 names the flip: an on-demand document or skill section that the
  sentence points to, with the sentence kept as the trigger.
- **The change depends on `explain-in-controlled-english`.** → This change ships no prose of its own, so the rendering
  half can land in either order. Until the sibling lands, nothing tells agents to draw diagrams; `serve` would simply
  draw any mermaid block a note already holds. tasks.md checks that the sentence is present before calling the work
  done.

## Migration Plan

No store migration. Upgrading `ctxr` installs the new dependency. The entry document does not change because of this
change; the diagram sentence arrives with `explain-in-controlled-english`'s baseline section. Notes that already contain mermaid
blocks start drawing in `serve` with no edit.

Rollback is removing the dependency, the two asset routes, the fence rule, and the shell slot.
Notes keep their mermaid blocks, which then render as code blocks again, as they did before this change.

## Open Questions

- Whether `review-the-knowledge-diff`'s view renders through `renderNoteBody`, or through a renderer of its own. If it
  renders through `renderNoteBody`, it draws mermaid with no further work. If it has its own renderer, it should call
  the same fence rule. Either way this change's requirements already cover any document rendered through the shell.
