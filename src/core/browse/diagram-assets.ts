import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * render-diagrams-in-notes design.md D4/D6: the diagram renderer is the
 * installed `@mermaid-js/tiny` dependency's single-file build, served from
 * where npm put it rather than copied into `templates/`. Its route carries
 * the installed version, so an upgrade changes the URL and an immutably
 * cached copy can never go stale. The shell builds its script references
 * and `serve.ts` matches requests from the constants here — two readers,
 * one spelling.
 */
const RENDERER_PACKAGE = '@mermaid-js/tiny';
const RENDERER_FILE = 'mermaid.tiny.js';

/** The page script that draws each diagram block; a file under `templates/serve/`. */
export const DIAGRAM_SCRIPT_ROUTE = '/assets/diagrams.mjs';
export const DIAGRAM_SCRIPT_FILE = 'diagrams.mjs';

/** Every renderer route starts here; one naming any version but the installed one is a 404. */
export const RENDERER_ROUTE_PREFIX = '/assets/mermaid/';

export interface DiagramRenderer {
  /** Absolute path of the renderer file inside the installed dependency. */
  filePath: string;
  version: string;
  /** `/assets/mermaid/<version>/mermaid.tiny.js`. */
  route: string;
}

let resolved: DiagramRenderer | undefined;

/** Resolved once and memoized: the installed dependency cannot change under a running process. */
export function diagramRenderer(): DiagramRenderer {
  if (resolved) return resolved;
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve(`${RENDERER_PACKAGE}/package.json`);
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };
  resolved = {
    filePath: path.join(path.dirname(manifestPath), 'dist', RENDERER_FILE),
    version,
    route: `${RENDERER_ROUTE_PREFIX}${version}/${RENDERER_FILE}`,
  };
  return resolved;
}
