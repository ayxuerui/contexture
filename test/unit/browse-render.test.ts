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
    const html = renderNoteBody('See [[b]].', resolveLink);
    expect(html).toContain('<a href="/notes/projects/b.md">b</a>');
  });

  it('renders an unresolvable wikilink as visibly-marked, non-clickable markup naming it unresolved', () => {
    const resolveLink = buildLinkResolver([note('projects/a.md', 'See [[nowhere]].')]);
    const html = renderNoteBody('See [[nowhere]].', resolveLink);
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
    const html = renderNoteBody('See [[beta]].', resolveLink);
    expect(html).not.toContain('<a href');
    expect(html).toContain('class="ctxr-broken-link"');
    expect(html).toContain('data-reason="ambiguous"');
  });

  it('renders a piped wikilink label while resolving against the target, not the label', () => {
    const resolveLink = buildLinkResolver([note('projects/b.md', '')]);
    const html = renderNoteBody('See [[b|the second project]].', resolveLink);
    expect(html).toContain('<a href="/notes/projects/b.md">the second project</a>');
  });

  it('renders ordinary markdown constructs unaffected by the wikilink rule', () => {
    const resolveLink = buildLinkResolver([]);
    const html = renderNoteBody('# Heading\n\n- one\n- two\n\n`code` and **bold**.\n\n```js\nconst x = 1;\n```\n', resolveLink);
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<pre><code');
  });

  it('escapes HTML in a wikilink label so a resolved or broken link cannot inject markup', () => {
    const resolveLink = buildLinkResolver([note('b.md', '')]);
    const html = renderNoteBody('[[b|<img src=x onerror=alert(1)>]]', resolveLink);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
