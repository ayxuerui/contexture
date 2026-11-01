import path from 'node:path';
import { DEFAULT_HOUSE_CONVENTIONS_FILE_NAME, DEFAULT_LOG_PATH, DEFAULT_MISSION_MAX_BYTES, DEFAULT_SCRATCH_PATH } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';

/**
 * publish-one-contexture-plugin D2: every value an owned skill's template
 * takes from one store, as a `__TOKEN__` in the template, with the label the
 * store-independent MCP render writes in its place (`<inbox path>`) and the
 * value a store gives it. The one list both readers use: the CLI render
 * substitutes `value`, the MCP render substitutes the label, and the server
 * instructions' *This store* section names each label with this store's value,
 * so a label in a skill and the label the connector answers it with cannot drift.
 *
 * The computed blocks (`__LAYER_STEP__`, `__RELATION_GROUPING_STEP__`) are not
 * here: they are whole steps, rendered from the taxonomy and the relation
 * vocabulary, and the MCP render points them at the layers and the vocabulary
 * the instructions list.
 */
export interface StorePlaceholder {
  /** The template token, without its surrounding underscores. */
  token: string;
  /** What the MCP render names the value: `<label>`. */
  label: string;
  /** This store's value, as the CLI render writes it. */
  value: (config: StoreConfig) => string;
  /**
   * The templates write this token outside a code span, so the MCP render
   * wraps its label in one: a bare `<label>` is an HTML tag to a markdown reader.
   */
  bare?: true;
}

/** Where this store's operator-authored conventions live, for a skill to name by path. */
export function houseConventionsPath(config: StoreConfig): string {
  return path.join(config.harness.guidance_path, DEFAULT_HOUSE_CONVENTIONS_FILE_NAME).split(path.sep).join('/');
}

export const STORE_PLACEHOLDERS: readonly StorePlaceholder[] = [
  { token: 'DEFAULT_BRANCH', label: 'default branch', value: (config) => config.git.default_branch },
  { token: 'INBOX_PATH', label: 'inbox path', value: (config) => config.ingest.inbox_path },
  { token: 'CAPTURE_ROOT', label: 'capture root', value: (config) => config.ingest.capture_root },
  { token: 'TEMPLATES_PATH', label: 'templates path', value: (config) => config.templates.path },
  { token: 'LOG_PATH', label: 'log path', value: (config) => config.organize.log_path ?? DEFAULT_LOG_PATH },
  { token: 'GRAPH_DOCUMENT_PATH', label: 'graph document', value: () => GRAPH_DOCUMENT_RELATIVE_PATH },
  { token: 'CLUSTER_DEPTH', label: 'cluster depth', value: (config) => String(config.retrieval.graph.cluster_depth), bare: true },
  { token: 'MISSION_MAX_BYTES', label: 'mission size limit', value: (config) => String(config.organize.mission_max_bytes ?? DEFAULT_MISSION_MAX_BYTES) },
  { token: 'HOUSE_CONVENTIONS_PATH', label: 'house conventions path', value: houseConventionsPath },
  { token: 'ARCHIVE_DESTINATION', label: 'archive destination', value: (config) => config.organize.archive_destination },
  { token: 'SCRATCH_PATH', label: 'scratch path', value: (config) => config.harness.scratch_path ?? DEFAULT_SCRATCH_PATH },
  // The preamble's session root: `<worktrees path><directory>/`.
  { token: 'WORKTREES_PATH', label: 'worktrees path', value: (config) => config.session.worktrees_path.replace(/\/*$/, '/') },
];

/** `<label>`, as a skill in the MCP render and the *This store* section both write it. */
export function placeholderName(placeholder: StorePlaceholder): string {
  return `<${placeholder.label}>`;
}

/**
 * A token map whose values are computed when a template reads them, so a
 * render reads only the configuration its templates name (a fixture seed
 * with a partial configuration renders, as it did before the map existed).
 */
export function lazyValues(entries: Iterable<readonly [string, () => string]>): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const [token, compute] of entries) Object.defineProperty(values, token, { enumerable: true, get: compute });
  return values;
}

/** The CLI render's entry for each placeholder: its value in this store. */
export function storeValueEntries(config: StoreConfig): (readonly [string, () => string])[] {
  return STORE_PLACEHOLDERS.map((p) => [p.token, () => p.value(config)] as const);
}

/** The token map the MCP render fills a template with: each placeholder's label, and no configuration. */
export function placeholderValues(): Record<string, string> {
  return Object.fromEntries(STORE_PLACEHOLDERS.map((p) => [p.token, p.bare === true ? `\`${placeholderName(p)}\`` : placeholderName(p)]));
}

/**
 * One pass over `__TOKEN__`s, so a value that happens to contain a token is
 * never substituted again, and a function replacement, so a `$` in a value is
 * written as it is. A token the map does not name is left in place; the tests
 * assert that none survives a render.
 */
export function fillTokens(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/__([A-Z][A-Z0-9_]*?)__/g, (whole, token: string) => values[token] ?? whole);
}
