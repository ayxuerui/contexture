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
    groupLabels: new Map(),
    previews: new Map(),
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

/** One session worktree's previewable pages, as `buildRouteTable` reports them. */
function withPreviews(
  worktrees: Readonly<Record<string, readonly string[]>>,
  titles: Readonly<Record<string, string>> = {},
): RouteTable {
  return makeTable({
    previews: new Map(
      Object.entries(worktrees).map(([worktree, pages]) => [
        worktree,
        {
          files: new Map(
            pages.map((page) => [`${page}/index.html`, { urlPath: `${page}/index.html`, absolutePath: `/abs/${worktree}/${page}/index.html` }]),
          ),
          titles: new Map(pages.filter((page) => titles[page] !== undefined).map((page) => [page, titles[page]!])),
        },
      ]),
    ),
  });
}

/** The resolved path -> display-name map `buildRouteTable` derives from the configured taxonomy layers. */
function withGroupLabels(table: RouteTable, labels: Readonly<Record<string, string>>): RouteTable {
  return { ...table, groupLabels: new Map(Object.entries(labels)) };
}

function navHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 class="ctxr-nav-heading"><a href="[^"]*">([^<]*)<\/a><\/h2>/g)].map((m) => m[1]!);
}

function indexHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 id="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]!);
}

const REQUIRED_ORDER = ['Published pages', 'Preview', 'Notes', 'Catalog', 'Graph'];

describe('renderNav', () => {
  it('names the five content areas in the required order', () => {
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
    expect(html.match(/none yet/g)).toHaveLength(4); // publish, preview, notes, catalog — the graph is a single document
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

describe('renderNav grouping-directory labels', () => {
  it("labels a published page's grouping directory with its configured layer name", () => {
    const html = renderNav(withGroupLabels(withPublishFiles('ctx-a/example-page/index.html'), { 'ctx-a': 'Ctx A' }));
    expect(html).toContain('<summary>Ctx A</summary>');
    expect(html).not.toContain('<summary>ctx-a</summary>');
    expect(html).toContain('<a href="/publish/ctx-a/example-page/index.html">example-page</a>');
  });

  it('keeps the directory segment for a grouping directory matching no configured layer', () => {
    const html = renderNav(withGroupLabels(withPublishFiles('ctx-b/example-page/index.html'), { 'ctx-a': 'Ctx A' }));
    expect(html).toContain('<summary>ctx-b</summary>');
  });

  it('labels a note folder the same way it labels a published page folder', () => {
    const html = renderNav(withGroupLabels(withNotes('ctx-a/example.md'), { 'ctx-a': 'Ctx A' }));
    expect(html).toContain('<summary>Ctx A</summary>');
    expect(html).not.toContain('<summary>ctx-a</summary>');
  });

  it('leaves a deeper directory sharing a labelled path\'s segment unlabelled', () => {
    const table = withGroupLabels(withPublishFiles('elsewhere/ctx-a/example-page/index.html'), { 'ctx-a': 'Ctx A' });
    const html = renderNav(table);
    expect(html).toContain('<summary>ctx-a</summary>');
    expect(html).not.toContain('<summary>Ctx A</summary>');
  });

  it('renders byte-identically to an unlabelled store when no layer is configured', () => {
    const pages = withPublishFiles('ctx-a/example-page/index.html');
    const notes = withNotes('ctx-a/example.md');
    expect(renderNav({ ...pages, notes: notes.notes })).toBe(
      renderNav(withGroupLabels({ ...pages, notes: notes.notes }, {})),
    );
  });

  it('places a labelled group where its directory segment sorts, not where its label does', () => {
    const table = withGroupLabels(withPublishFiles('ctx-a/page-one/index.html', 'ctx-b/page-two/index.html'), {
      'ctx-a': 'Zebra',
      'ctx-b': 'Aardvark',
    });
    const html = renderNav(table);
    expect(html.indexOf('<summary>Zebra</summary>')).toBeLessThan(html.indexOf('<summary>Aardvark</summary>'));
  });

  it('escapes a configured layer name', () => {
    const html = renderNav(withGroupLabels(withPublishFiles('ctx-a/example-page/index.html'), { 'ctx-a': '<b>X</b>' }));
    expect(html).toContain('<summary>&lt;b&gt;X&lt;/b&gt;</summary>');
    expect(html).not.toContain('<summary><b>X</b></summary>');
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
    for (const anchor of ['published-pages', 'preview', 'notes', 'catalog', 'graph']) {
      expect(html).toContain(`<h2 id="${anchor}">`);
    }
    expect(renderNav(makeTable())).toContain('href="/#published-pages"');
  });

  it('counts published pages, previewable pages, notes, and catalog sections', () => {
    const table = makeTable({
      notes: new Map([['a.md', note('a.md')]]),
      catalog: new Map([['layer-a', { id: 'layer-a', absolutePath: '/abs/layer-a.md' }]]),
      publishFiles: new Map([['p/index.html', { urlPath: 'p/index.html', absolutePath: '/abs/p/index.html' }]]),
    });
    expect(renderIndexBody(table)).toContain('1 published page(s), 0 page(s) in preview, 1 note(s), 1 catalog section(s).');
  });
});

describe('the preview area', () => {
  it('renders second, after published pages, in both the nav and the index', () => {
    const table = makeTable();

    expect(navHeadings(renderNav(table))).toEqual(['Published pages', 'Preview', 'Notes', 'Catalog', 'Graph']);
    expect([...renderIndexBody(table).matchAll(/<h2 id="([^"]*)">/g)].map((m) => m[1])).toEqual([
      'published-pages',
      'preview',
      'notes',
      'catalog',
      'graph',
    ]);
  });

  it('groups a previewable page under the worktree holding it', () => {
    const html = renderNav(withPreviews({ 'session-a': ['ctx-a/draft-page'] }));

    expect(html).toContain('<summary>session-a</summary>');
    expect(html).toContain('<summary>ctx-a</summary>');
    expect(html).toContain('href="/preview/session-a/ctx-a/draft-page/index.html"');
  });

  it("labels an entry with the page's declared name", () => {
    const html = renderNav(withPreviews({ 'session-a': ['ctx-a/draft-page'] }, { 'ctx-a/draft-page': 'Still Drafting' }));

    expect(html).toContain('>Still Drafting</a>');
    expect(html).not.toContain('>draft-page</a>');
  });

  it('falls back to the directory segment when the page declares no name', () => {
    expect(renderNav(withPreviews({ 'session-a': ['ctx-a/draft-page'] }))).toContain('>draft-page</a>');
  });

  it('gives a folder inside a worktree the same declared name the published area gives it', () => {
    const table = withGroupLabels(withPreviews({ 'session-a': ['ctx-a/draft-page'] }), { 'ctx-a': 'Ctx A' });
    const html = renderNav(table);

    expect(html).toContain('<summary>Ctx A</summary>');
    expect(html).not.toContain('<summary>ctx-a</summary>');
    // D2: the worktree segment matches no layer and keeps its own directory name.
    expect(html).toContain('<summary>session-a</summary>');
  });

  it('keeps two worktrees as separate groups', () => {
    const html = renderNav(withPreviews({ 'session-a': ['page-a'], 'session-b': ['page-b'] }));

    expect(html).toContain('<summary>session-a</summary>');
    expect(html).toContain('<summary>session-b</summary>');
    expect(html).toContain('href="/preview/session-a/page-a/index.html"');
    expect(html).toContain('href="/preview/session-b/page-b/index.html"');
  });

  it('names the area and reports it empty when nothing is in flight', () => {
    const html = renderNav(makeTable());

    expect(navHeadings(html)).toContain('Preview');
    const previewSection = html.slice(html.indexOf('id="nav-preview"'));
    expect(previewSection.slice(0, previewSection.indexOf('</section>'))).toContain('none yet');
  });

  it('counts previewable pages on the index page', () => {
    expect(renderIndexBody(withPreviews({ 'session-a': ['page-a', 'page-b'] }))).toContain('2 page(s) in preview');
  });

  it('introduces no client-side script', () => {
    expect(renderNav(withPreviews({ 'session-a': ['ctx-a/draft-page'] }))).not.toContain('<script');
  });
});
