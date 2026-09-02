import { titleFor } from '../catalog/model.js';
import { escapeHtml } from './render.js';
import { publishPages, PUBLISH_INDEX_FILE, type RouteTable } from './routes.js';
import { buildPathTree, type TreeNode } from './tree.js';

/**
 * The four content areas the browsing surface serves, in the one order both
 * the navigation and the index page render them — declared once here so the
 * two cannot disagree about what that order is.
 */
const AREAS = ['publish', 'notes', 'catalog', 'graph'] as const;

type AreaId = (typeof AREAS)[number];

const AREA_TITLES: Readonly<Record<AreaId, string>> = {
  publish: 'Published pages',
  notes: 'Notes',
  catalog: 'Catalog',
  graph: 'Graph',
};

/** The index page's anchor for each area, which is also what the navigation links to. */
const AREA_ANCHORS: Readonly<Record<AreaId, string>> = {
  publish: 'published-pages',
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
    return `<li class="ctxr-tree-dir"><details${open}><summary>${escapeHtml(node.name)}</summary>${children}</details></li>`;
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

/** The listing for one area, rendered once and used by both the navigation and the index page. */
function renderAreaContent(table: RouteTable, area: AreaId): string {
  switch (area) {
    case 'publish': {
      const pages = publishPages(table);
      const tree = buildPathTree(
        pages,
        (page) => lastSegment(page),
        (page) => `/publish/${encodeURI(page)}/${PUBLISH_INDEX_FILE}`,
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
  const counts = `<p class="ctxr-summary">${publishPages(table).length} published page(s), ${table.notes.size} note(s), ${table.catalog.size} catalog section(s).</p>`;

  const sections = AREAS.map((area) => {
    const heading = `<h2 id="${AREA_ANCHORS[area]}">${escapeHtml(AREA_TITLES[area])}</h2>`;
    return `${heading}\n${renderAreaContent(table, area)}`;
  });

  return ['<h1>contexture</h1>', counts, ...sections].join('\n');
}
