import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAM_SCRIPT_FILE, DIAGRAM_SCRIPT_ROUTE, diagramRenderer } from './diagram-assets.js';
import type { NavState, ThemeMode } from './preferences.js';
import { escapeHtml, type RenderedBody } from './render.js';

/**
 * local-browsing-surface design.md D7: shell.html/style.css are markup and
 * CSS, not markdown fragments meant for splicing, so they don't fit
 * `packagedTemplate()`'s contract (strips exactly one trailing newline from
 * a `.md` file, for `substituteBlock`'s line-array callers). This mirrors
 * `hooks.ts`'s own small async reader for the same reason: a different file
 * type needs a different loading contract, not a stretched shared one.
 */
function templatesDir(): string {
  return fileURLToPath(new URL('../../../templates/serve', import.meta.url));
}

async function readServeTemplate(fileName: string): Promise<string> {
  return readFile(path.join(templatesDir(), fileName), 'utf8');
}

export interface ShellState {
  theme: ThemeMode;
  navState: NavState;
}

/** design.md D9: the wide-viewport control links to the opposite of the current state. */
const NAV_TOGGLE_HREF: Readonly<Record<NavState, string>> = {
  shown: '?ctxr-nav=collapsed',
  collapsed: '?ctxr-nav=shown',
};

const NAV_TOGGLE_LABEL: Readonly<Record<NavState, string>> = {
  shown: 'Hide sidebar',
  collapsed: 'Show sidebar',
};

/**
 * render-diagrams-in-notes design.md D6: only a body holding a diagram block
 * references any script — the renderer as a classic deferred script, then the
 * page script as a module, which runs after it because deferred classic and
 * module scripts execute in document order. Both are routes on this server.
 */
function diagramScripts(): string {
  return `<script defer src="${diagramRenderer().route}"></script><script type="module" src="${DIAGRAM_SCRIPT_ROUTE}"></script>`;
}

/**
 * Wraps rendered body HTML in the shared page shell, substituting every
 * slot exactly once. browse-navigation-by-folder design.md D1: the
 * navigation is a slot here rather than markup each route prepends, so no
 * HTML route can render without it.
 *
 * Each substitution passes a replacer function rather than a string, because
 * `String.replace` reads `$&`, `$\'` and friends out of a string replacement
 * — and a note path or title is free to contain them. `state.theme` and
 * `state.navState` are always one of a fixed, known-safe literal union —
 * resolved by `resolveTheme`/`resolveNavState`, never raw cookie or
 * query-parameter text — so they're interpolated directly; the toggle label
 * is still escaped, since escaping a value already known-safe costs nothing
 * and keeps every slot here following the same rule.
 */
export async function renderShell(title: string, body: RenderedBody, navHtml: string, state: ShellState): Promise<string> {
  const shell = await readServeTemplate('shell.html');
  // First, so slot-shaped text inside a title, the navigation or a body can never be taken for it.
  return shell
    .replace('{{SCRIPTS}}', () => (body.hasDiagram ? diagramScripts() : ''))
    .replace('{{TITLE}}', () => escapeHtml(title))
    .replace('{{THEME}}', () => state.theme)
    .replace('{{NAV_STATE}}', () => state.navState)
    .replace('{{NAV_TOGGLE_HREF}}', () => NAV_TOGGLE_HREF[state.navState])
    .replace('{{NAV_TOGGLE_LABEL}}', () => escapeHtml(NAV_TOGGLE_LABEL[state.navState]))
    .replace('{{NAV}}', () => navHtml)
    .replace('{{BODY}}', () => body.html);
}

export async function readStylesheet(): Promise<string> {
  return readServeTemplate('style.css');
}

/** render-diagrams-in-notes design.md D6: served as a file, so the shell itself stays free of script. */
export async function readDiagramScript(): Promise<string> {
  return readServeTemplate(DIAGRAM_SCRIPT_FILE);
}
