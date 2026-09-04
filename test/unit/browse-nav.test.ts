import { describe, expect, it } from 'vitest';
import { renderIndexBody, renderNav } from '../../src/core/browse/nav.js';
import type { RouteTable } from '../../src/core/browse/routes.js';
import type { Note } from '../../src/core/notes/list.js';

function note(notePath: string, frontmatter?: Record<string, unknown>): Note {
  return { path: notePath, frontmatter, body: '' };
}

function makeTable(overrides: Partial<RouteTable> = {}): RouteTable {
  return {
    notes: new Map(),
    catalog: new Map(),
    graphDocumentPath: '/nowhere/graph.md',
    publishFiles: new Map(),
    publishTitles: new Map(),
    ...overrides,
  };
}

function withNotes(...paths: readonly (string | Note)[]): RouteTable {
  const entries = paths.map((p): [string, Note] => (typeof p === 'string' ? [p, note(p)] : [p.path, p]));
  return makeTable({ notes: new Map(entries) });
}

function withPublishFiles(...urlPaths: readonly string[]): RouteTable {
  return makeTable({
    publishFiles: new Map(urlPaths.map((urlPath) => [urlPath, { urlPath, absolutePath: `/abs/${urlPath}` }])),
  });
}

function navHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 class="ctxr-nav-heading"><a href="[^"]*">([^<]*)<\/a><\/h2>/g)].map((m) => m[1]!);
}

function indexHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 id="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]!);
}

const REQUIRED_ORDER = ['Published pages', 'Notes', 'Catalog', 'Graph'];

describe('renderNav', () => {
  it('names the four content areas in the required order', () => {
    expect(navHeadings(renderNav(makeTable()))).toEqual(REQUIRED_ORDER);
  });

  it('nests a note under a group per directory segment rather than naming the whole path', () => {
    const html = renderNav(withNotes('folder-a/folder-b/example.md'));
    expect(html).toContain('<summary>folder-a</summary>');
    expect(html).toContain('<summary>folder-b</summary>');
    expect(html).toContain('<a href="/notes/folder-a/folder-b/example.md">example</a>');
    expect(html).not.toContain('>folder-a/folder-b/example.md<');
  });

  it('opens the top level and leaves deeper groups collapsed', () => {
    const html = renderNav(withNotes('folder-a/folder-b/example.md'));
    expect(html).toContain('<details open><summary>folder-a</summary>');
    expect(html).toContain('<details><summary>folder-b</summary>');
  });

  it('places a note at the store root outside any folder group', () => {
    const html = renderNav(withNotes('root-note.md'));
    const notesArea = html.slice(html.indexOf('id="nav-notes"'), html.indexOf('id="nav-catalog"'));
    expect(notesArea).toContain('<a href="/notes/root-note.md">root-note</a>');
    expect(notesArea).not.toContain('<summary>');
  });

  it('labels a note by its frontmatter title when it declares one', () => {
    const html = renderNav(withNotes(note('folder-a/example.md', { title: 'A Declared Title' })));
    expect(html).toContain('<a href="/notes/folder-a/example.md">A Declared Title</a>');
  });

  it('still names an area that holds nothing, reporting it as empty', () => {
    const html = renderNav(makeTable());
    expect(navHeadings(html)).toEqual(REQUIRED_ORDER);
    expect(html.match(/none yet/g)).toHaveLength(3); // publish, notes, catalog — the graph is a single document
    expect(html).toContain('<a href="/graph">graph document</a>');
  });

  it('links a nested published page at its full path under the publish route', () => {
    const html = renderNav(withPublishFiles('folder-a/folder-b/nested-page/index.html'));
    expect(html).toContain('<summary>folder-a</summary>');
    expect(html).toContain('<summary>folder-b</summary>');
    expect(html).toContain('<a href="/publish/folder-a/folder-b/nested-page/index.html">nested-page</a>');
  });

  it('presents a directory holding no index page as a group, not as a page link', () => {
    const html = renderNav(withPublishFiles('folder-a/README.md', 'folder-a/real-page/index.html'));
    expect(html).toContain('<a href="/publish/folder-a/real-page/index.html">real-page</a>');
    expect(html).not.toContain('>folder-a</a>');
  });

  it('labels a published page by its declared title when it has one', () => {
    const table = makeTable({
      publishFiles: new Map([
        ['folder-a/real-page/index.html', { urlPath: 'folder-a/real-page/index.html', absolutePath: '/abs/folder-a/real-page/index.html' }],
      ]),
      publishTitles: new Map([['folder-a/real-page', 'A Declared Page Name']]),
    });
    const html = renderNav(table);
    expect(html).toContain('<a href="/publish/folder-a/real-page/index.html">A Declared Page Name</a>');
    expect(html).not.toContain('>real-page<');
  });

  it('falls back to the directory segment when a published page declares no title', () => {
    const html = renderNav(withPublishFiles('folder-a/real-page/index.html'));
    expect(html).toContain('<a href="/publish/folder-a/real-page/index.html">real-page</a>');
  });

  it('links catalog sections without grouping them', () => {
    const table = makeTable({
      catalog: new Map([
        ['uncategorized', { id: 'uncategorized', absolutePath: '/abs/uncategorized.md' }],
        ['layer-a', { id: 'layer-a', absolutePath: '/abs/layer-a.md' }],
      ]),
    });
    const html = renderNav(table);
    expect(html).toContain('<a href="/catalog/layer-a">layer-a</a>');
    expect(html).toContain('<a href="/catalog/uncategorized">uncategorized</a>');
  });

  it('emits no script element', () => {
    const html = renderNav(withNotes('folder-a/example.md'));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });

  it('escapes HTML metacharacters in folder names, labels, and hrefs', () => {
    const html = renderNav(withNotes(note('fol<der/a&b.md', { title: '<script>alert(1)</script>' })));
    expect(html).toContain('<summary>fol&lt;der</summary>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="/notes/fol%3Cder/a&amp;b.md"');
  });
});

describe('renderIndexBody', () => {
  it('renders its content sections in the same order the navigation names them', () => {
    expect(indexHeadings(renderIndexBody(makeTable()))).toEqual(REQUIRED_ORDER);
  });

  it('renders the same listings the navigation renders', () => {
    const table = withNotes('folder-a/folder-b/example.md');
    const html = renderIndexBody(table);
    expect(html).toContain('<summary>folder-a</summary>');
    expect(html).toContain('<a href="/notes/folder-a/folder-b/example.md">example</a>');
  });

  it('carries an anchor for each area so the navigation can link to it', () => {
    const html = renderIndexBody(makeTable());
    for (const anchor of ['published-pages', 'notes', 'catalog', 'graph']) {
      expect(html).toContain(`<h2 id="${anchor}">`);
    }
    expect(renderNav(makeTable())).toContain('href="/#published-pages"');
  });

  it('counts published pages, notes, and catalog sections', () => {
    const table = makeTable({
      notes: new Map([['a.md', note('a.md')]]),
      catalog: new Map([['layer-a', { id: 'layer-a', absolutePath: '/abs/layer-a.md' }]]),
      publishFiles: new Map([['p/index.html', { urlPath: 'p/index.html', absolutePath: '/abs/p/index.html' }]]),
    });
    expect(renderIndexBody(table)).toContain('1 published page(s), 1 note(s), 1 catalog section(s).');
  });
});
