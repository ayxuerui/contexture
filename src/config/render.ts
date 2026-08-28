import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { StoreConfigSchema, type StoreConfig } from './schema.js';

const HEADER = '# contexture store configuration\n\n';

/**
 * Renders a StoreConfig to YAML text and round-trips it back through the
 * schema before returning — a render that doesn't round-trip is a bug caught
 * here, before any byte reaches disk, rather than discovered later as a
 * corrupted store.
 */
export function renderStoreConfig(config: StoreConfig): string {
  const text = HEADER + stringifyYaml(config, { indent: 2 });
  StoreConfigSchema.parse(parseYaml(text)); // throws on mismatch; that IS the check
  return text;
}
