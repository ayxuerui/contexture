import { isDeepStrictEqual } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { SHIPPED_DEFAULTS } from './defaults.js';
import { StoreConfigSchema, type StoreConfig } from './schema.js';

const HEADER = [
  '# contexture store configuration',
  '#',
  '# Only what this store chose. Any key not here takes contexture\'s shipped',
  '# default, and follows it when a later release improves it.',
  '',
  '',
].join('\n');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * config-defaults-as-the-convention (D3, D4): drops every value equal to its
 * shipped default, so what reaches disk is the set of decisions the store has
 * made. Applied here rather than at `init` because this is the single writer —
 * every migration's write-back passes through it too, and one that did not
 * would re-materialize the full resolved shape and undo the omission.
 *
 * Equality is deep and order-sensitive: a list holding the same entries in a
 * different order is written as the store wrote it. Treating that as equal
 * would silently reorder an operator's file to save one line.
 *
 * A key absent from `SHIPPED_DEFAULTS` is always kept — contexture has no
 * opinion about it, or (as with `organize.mission_path`) its absence is
 * itself the meaningful state.
 */
function withoutShippedDefaults(value: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, declared] of Object.entries(value)) {
    const shipped = defaults[key];
    if (shipped === undefined) {
      kept[key] = declared;
      continue;
    }
    if (isPlainObject(declared) && isPlainObject(shipped)) {
      const nested = withoutShippedDefaults(declared, shipped);
      // A block whose every key matched is dropped whole, not left as `{}`.
      if (Object.keys(nested).length > 0) kept[key] = nested;
      continue;
    }
    if (isDeepStrictEqual(declared, shipped)) continue;
    kept[key] = declared;
  }
  return kept;
}

/**
 * Renders a StoreConfig to YAML text and round-trips it back through the
 * schema before returning — a render that doesn't round-trip is a bug caught
 * here, before any byte reaches disk, rather than discovered later as a
 * corrupted store.
 *
 * The round-trip also proves the omission was lossless: what the pruned text
 * parses back to must equal what was passed in, so a default that drifted out
 * of step with the schema fails here rather than silently changing a store's
 * behavior.
 */
export function renderStoreConfig(config: StoreConfig): string {
  const declared = withoutShippedDefaults(config as unknown as Record<string, unknown>, SHIPPED_DEFAULTS as unknown as Record<string, unknown>);
  const text = HEADER + stringifyYaml(declared, { indent: 2 });
  const reparsed = StoreConfigSchema.parse(parseYaml(text)); // throws on mismatch; that IS the check
  if (!isDeepStrictEqual(reparsed, config)) {
    throw new Error(
      'contexture.yaml render dropped a key whose shipped default does not match what the schema resolves. ' +
        'SHIPPED_DEFAULTS and StoreConfigSchema disagree.',
    );
  }
  return text;
}

/**
 * The dotted paths `renderStoreConfig` would drop from this config — what a
 * migration reports it is about to remove, derived from the same walk that
 * does the removing so the report and the write cannot disagree.
 */
export function redundantKeyPaths(config: StoreConfig): string[] {
  const found: string[] = [];
  const walk = (value: Record<string, unknown>, defaults: Record<string, unknown>, prefix: string): void => {
    for (const [key, declared] of Object.entries(value)) {
      const shipped = defaults[key];
      if (shipped === undefined) continue;
      const dotted = prefix === '' ? key : `${prefix}.${key}`;
      if (isPlainObject(declared) && isPlainObject(shipped)) {
        walk(declared, shipped, dotted);
        continue;
      }
      if (isDeepStrictEqual(declared, shipped)) found.push(dotted);
    }
  };
  walk(config as unknown as Record<string, unknown>, SHIPPED_DEFAULTS as unknown as Record<string, unknown>, '');
  return found;
}
