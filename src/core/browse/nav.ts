import { titleFor } from '../catalog/model.js';
import { previewRoute, publishRoute } from './page-url.js';
import { escapeHtml } from './render.js';
import { previewPages, publishPages, PUBLISH_INDEX_FILE, type RouteTable } from './routes.js';
import { buildPathTree, type DirectoryLabelFor, type TreeNode } from './tree.js';

/**
 * The five content areas the browsing surface serves, in the one order both
 * the navigation and the index page render them — declared once here so the
 * two cannot disagree about what that order is.
 *
 * preview-pages-before-they-land: the preview area sits directly after the
 * published pages because it holds the same kind of thing in a different
 * state, and reading the two adjacently is the whole point of serving them
 * from one process.
 */
const AREAS = ['publish', 'preview', 'notes', 'catalog', 'graph'] as const;

type AreaId = (typeof AREAS)[number];

const AREA_TITLES: Readonly<Record<AreaId, string>> = {
  publish: 'Published pages',
  preview: 'Preview',
  notes: 'Notes',
  catalog: 'Catalog',
  graph: 'Graph',
};

/** The index page's anchor for each area, which is also what the navigation links to. */
const AREA_ANCHORS: Readonly<Record<AreaId, string>> = {
  publish: 'published-pages',
  preview: 'preview',
  notes: 'notes',
  catalog: 'catalog',
  graph: 'graph',
};

const EMPTY_STATE = '<p class="ctxr-empty">none yet</p>';

const GRAPH_LINK = '<p><a href="/graph">graph document</a></p>';

function lastSegment(pathValue: string): string {
  const separator = pathValue.lastIndexOf('/');
  return separator === -1 ? pathValue : pathValue.slice(separator + 1);
}

/**
 * browse-navigation-by-folder design.md D3: collapsing is `<details>` and
 * nothing else, so the tree stays navigable with scripting disabled. The
 * top level renders open and everything below it renders collapsed, which
 * bounds what a deep store shows on arrival by its top-level directory
 * count rather than by its note count.
 */
function renderTree(nodes: readonly TreeNode[], depth: number): string {
  if (nodes.length === 0) return EMPTY_STATE;

  const items = nodes.map((node) => {
    if (node.kind === 'leaf') {
      return `<li class="ctxr-tree-leaf"><a href="${escapeHtml(node.href)}">${escapeHtml(node.label)}</a></li>`;
    }
    const open = depth === 0 ? ' open' : '';
    const children = renderTree(node.children, depth + 1);
    // file-published-pages-by-location D7: a directory's label is what it is
    // called; `node.name` is what ordered it, and `compareNodes` already read
    // that. Falling back to the segment is the same "one answer to what this is
    // called" rule a page entry follows for its declared name.
    const summary = escapeHtml(node.label ?? node.name);
    return `<li class="ctxr-tree-dir"><details${open}><summary>${summary}</summary>${children}</details></li>`;
  });

  return `<ul class="ctxr-tree">${items.join('')}</ul>`;
}

function renderFlatList(items: readonly string[], hrefFor: (item: string) => string): string {
  if (items.length === 0) return EMPTY_STATE;
  const listItems = items.map(
    (item) => `<li class="ctxr-tree-leaf"><a href="${escapeHtml(hrefFor(item))}">${escapeHtml(item)}</a></li>`,
  );
  return `<ul class="ctxr-tree">${listItems.join('')}</ul>`;
}

/**
 * file-published-pages-by-location D8: both folder trees resolve a group's
 * label the same way, because they render through one primitive into one
 * sidebar — a folder reading `Ctx A` in one area and `ctx-a` in the other,
 * inches apart, is the surprising outcome rather than the smaller one.
 */
function groupLabelFor(table: RouteTable): DirectoryLabelFor {
  return (directoryPath) => table.groupLabels.get(directoryPath);
}

/**
 * preview-pages-before-they-land D5: a preview tree's paths carry the session
 * worktree as their first segment, so `ctx-a` arrives here as
 * `<worktree>/ctx-a` and would miss `groupLabels`, which `buildRouteTable`
 * keys by store-relative layer path. Stripping the leading segment before the
 * lookup is file-published-pages-by-location D8 applied unchanged — a folder
 * reading `Ctx A` in one area and `ctx-a` in the other, inches apart, is the
 * surprising outcome rather than the smaller one. The worktree segment itself
 * strips to nothing, matches no layer, and keeps its own directory name (D2).
 */
function previewGroupLabelFor(table: RouteTable): DirectoryLabelFor {
  return (directoryPath) => {
    const separator = directoryPath.indexOf('/');
    if (separator === -1) return undefined;
    return table.groupLabels.get(directoryPath.slice(separator + 1));
  };
}

/** The listing for one area, rendered once and used by both the navigation and the index page. */
function renderAreaContent(table: RouteTable, area: AreaId): string {
  switch (area) {
    case 'publish': {
      const pages = publishPages(table);
      const tree = buildPathTree(
        pages,
        // serve-page-names-theme-and-nav-toggle D1: a page's declared name, falling back to its
        // directory segment — the same "one answer to what this is called" principle D6 gives notes.
        (page) => table.publishTitles.get(page) ?? lastSegment(page),
        (page) => publishRoute(`${page}/${PUBLISH_INDEX_FILE}`),
        groupLabelFor(table),
      );
      return renderTree(tree, 0);
    }
    case 'preview': {
      // One flat path list of `<worktree>/<page>` fed to the same primitive the
      // publish area uses, so the worktree becomes the top-level group without
      // a second tree-building path existing to disagree with the first.
      const worktrees = [...table.previews.keys()].sort();
      const entries = worktrees.flatMap((worktree) =>
        previewPages(table, worktree).map((page) => ({ worktree, page, path: `${worktree}/${page}` })),
      );
      const byPath = new Map(entries.map((entry) => [entry.path, entry]));
      const tree = buildPathTree(
        entries.map((entry) => entry.path),
        // The same "one answer to what this is called" rule the publish area
        // follows: the page's own declared name, else its directory segment.
        (treePath) => {
          const entry = byPath.get(treePath)!;
          return table.previews.get(entry.worktree)?.titles.get(entry.page) ?? lastSegment(entry.page);
        },
        (treePath) => {
          const entry = byPath.get(treePath)!;
          return previewRoute(entry.worktree, `${entry.page}/${PUBLISH_INDEX_FILE}`);
        },
        previewGroupLabelFor(table),
      );
      return renderTree(tree, 0);
    }
    case 'notes': {
      const paths = [...table.notes.keys()].sort();
      const tree = buildPathTree(
        paths,
        // D6: the same answer the catalog gives to "what is this note called".
        (notePath) => titleFor(table.notes.get(notePath)!),
        (notePath) => `/notes/${encodeURI(notePath)}`,
        groupLabelFor(table),
      );
      return renderTree(tree, 0);
    }
    case 'catalog':
      return renderFlatList([...table.catalog.keys()].sort(), (id) => `/catalog/${encodeURIComponent(id)}`);
    case 'graph':
      return GRAPH_LINK;
  }
}

function headingHrefFor(area: AreaId): string {
  return area === 'graph' ? '/graph' : `/#${AREA_ANCHORS[area]}`;
}

/**
 * browse-navigation-by-folder design.md D1: produced once and substituted
 * into the shell, so every HTML route carries it without four call sites
 * having to remember to.
 */
export function renderNav(table: RouteTable): string {
  const sections = AREAS.map((area) => {
    const heading = `<h2 class="ctxr-nav-heading"><a href="${headingHrefFor(area)}">${escapeHtml(AREA_TITLES[area])}</a></h2>`;
    return `<section class="ctxr-nav-area" id="nav-${AREA_ANCHORS[area]}">${heading}${renderAreaContent(table, area)}</section>`;
  });
  return `<nav class="ctxr-nav" aria-label="Store contents">${sections.join('')}</nav>`;
}

/** The index page's body: the same four areas, in the same order, from the same listings. */
export function renderIndexBody(table: RouteTable): string {
  const previewCount = [...table.previews.keys()].reduce((total, worktree) => total + previewPages(table, worktree).length, 0);
  const counts = `<p class="ctxr-summary">${publishPages(table).length} published page(s), ${previewCount} page(s) in preview, ${table.notes.size} note(s), ${table.catalog.size} catalog section(s).</p>`;

  const sections = AREAS.map((area) => {
    const heading = `<h2 id="${AREA_ANCHORS[area]}">${escapeHtml(AREA_TITLES[area])}</h2>`;
    return `${heading}\n${renderAreaContent(table, area)}`;
  });

  return ['<h1>contexture</h1>', counts, ...sections].join('\n');
}
