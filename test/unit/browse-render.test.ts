import { describe, expect, it } from 'vitest';
import { buildLinkResolver } from '../../src/core/browse/link-resolver.js';
import { renderNoteBody } from '../../src/core/browse/render.js';
import type { Note } from '../../src/core/notes/list.js';

function note(path: string, body: string): Note {
  return { path, frontmatter: undefined, body };
}

describe('renderNoteBody', () => {
  it('renders a resolvable wikilink as a hyperlink to the target note route', () => {
    const resolveLink = buildLinkResolver([note('projects/a.md', 'See [[b]].'), note('projects/b.md', '')]);
    const { html } = renderNoteBody('See [[b]].', resolveLink);
    expect(html).toContain('<a href="/notes/projects/b.md">b</a>');
  });

  it('renders an unresolvable wikilink as visibly-marked, non-clickable markup naming it unresolved', () => {
    const resolveLink = buildLinkResolver([note('projects/a.md', 'See [[nowhere]].')]);
    const { html } = renderNoteBody('See [[nowhere]].', resolveLink);
    expect(html).not.toContain('<a href');
    expect(html).toContain('class="ctxr-broken-link"');
    expect(html).toContain('data-reason="not_found"');
    expect(html).toContain('>nowhere<');
  });

  it('renders an ambiguous wikilink (two notes sharing a stem) as visibly-marked markup naming it ambiguous, not a link to either candidate', () => {
    const resolveLink = buildLinkResolver([
      note('projects/beta.md', ''),
      note('areas/beta.md', ''),
      note('projects/a.md', 'See [[beta]].'),
    ]);
    const { html } = renderNoteBody('See [[beta]].', resolveLink);
    expect(html).not.toContain('<a href');
    expect(html).toContain('class="ctxr-broken-link"');
    expect(html).toContain('data-reason="ambiguous"');
  });

  it('renders a piped wikilink label while resolving against the target, not the label', () => {
    const resolveLink = buildLinkResolver([note('projects/b.md', '')]);
    const { html } = renderNoteBody('See [[b|the second project]].', resolveLink);
    expect(html).toContain('<a href="/notes/projects/b.md">the second project</a>');
  });

  it('renders ordinary markdown constructs unaffected by the wikilink rule', () => {
    const resolveLink = buildLinkResolver([]);
    const { html } = renderNoteBody('# Heading\n\n- one\n- two\n\n`code` and **bold**.\n\n```js\nconst x = 1;\n```\n', resolveLink);
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<pre><code');
  });

  it('escapes HTML in a wikilink label so a resolved or broken link cannot inject markup', () => {
    const resolveLink = buildLinkResolver([note('b.md', '')]);
    const { html } = renderNoteBody('[[b|<img src=x onerror=alert(1)>]]', resolveLink);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

/**
 * render-diagrams-in-notes design.md D5. The expected strings for the
 * non-mermaid inputs were captured from `renderNoteBody` as it stood before
 * the fence rule existed, so these pin "unaffected" to real prior output.
 */
const BEFORE_FENCE_RULE: ReadonlyArray<readonly [string, string, string]> = [
  ['dot', '```dot\ndigraph { a -> b }\n```\n', '<pre><code class="language-dot">digraph { a -&gt; b }\n</code></pre>\n'],
  ['d2', '```d2\na -> b\n```\n', '<pre><code class="language-d2">a -&gt; b\n</code></pre>\n'],
  [
    'plantuml',
    '```plantuml\n@startuml\nA -> B\n@enduml\n```\n',
    '<pre><code class="language-plantuml">@startuml\nA -&gt; B\n@enduml\n</code></pre>\n',
  ],
  ['an unlabelled fence', '```\nplain <b>\n```\n', '<pre><code>plain &lt;b&gt;\n</code></pre>\n'],
  ['an indented code block', 'Para.\n\n    indented code\n', '<p>Para.</p>\n<pre><code>indented code\n</code></pre>\n'],
  [
    'a note with no fences',
    '# Title\n\nA *note* with https://example.com and a list:\n\n- one\n- two\n',
    '<h1>Title</h1>\n<p>A <em>note</em> with <a href="https://example.com">https://example.com</a> and a list:</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n',
  ],
];

describe('renderNoteBody diagram blocks', () => {
  const resolveLink = buildLinkResolver([]);

  it('renders a mermaid fence as a marked diagram block carrying its source', () => {
    const { html, hasDiagram } = renderNoteBody('```mermaid\nflowchart LR\n  A --> B\n```\n', resolveLink);
    expect(html).toBe('<pre class="ctxr-diagram"><code>flowchart LR\n  A --&gt; B\n</code></pre>\n');
    expect(hasDiagram).toBe(true);
  });

  it('escapes markup and ampersands in the source', () => {
    const { html } = renderNoteBody('```mermaid\nflowchart LR\n  A["<script>alert(1)</script> & co"] --> B\n```\n', resolveLink);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
  });

  it('matches mermaid followed by further info words', () => {
    const { html, hasDiagram } = renderNoteBody('```mermaid title="x"\ngraph TD\n```\n', resolveLink);
    expect(html).toBe('<pre class="ctxr-diagram"><code>graph TD\n</code></pre>\n');
    expect(hasDiagram).toBe(true);
  });

  for (const [name, body, before] of BEFORE_FENCE_RULE) {
    it(`renders ${name} exactly as before, and reports no diagram`, () => {
      expect(renderNoteBody(body, resolveLink)).toEqual({ html: before, hasDiagram: false });
    });
  }

  it('reports no diagram for an ordinary code block quoting the class name', () => {
    const { html, hasDiagram } = renderNoteBody('```html\n<pre class="ctxr-diagram"></pre>\n```\n', resolveLink);
    expect(html).toContain('ctxr-diagram');
    expect(hasDiagram).toBe(false);
  });
});
