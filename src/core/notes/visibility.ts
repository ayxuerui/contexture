import type { StoreConfig } from '../../config/schema.js';
import type { Note } from './list.js';

/**
 * context-visibility spec: resolution order is explicit → directory default
 * → the configured fail-closed default, and every resolution reports WHICH
 * rung produced it — not just the resolved value — so a note relying on the
 * fail-closed default is distinguishable from one genuinely classified.
 */
export type VisibilityReason = 'explicit' | 'directory default' | 'fail-closed default';

export interface VisibilityResolution {
  value: string;
  reason: VisibilityReason;
}

export function resolveVisibility(config: StoreConfig, note: Note): VisibilityResolution {
  const fieldKey = config.fields.visibility;
  const explicit = note.frontmatter?.[fieldKey];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return { value: explicit, reason: 'explicit' };
  }

  const directoryDefault = findDirectoryDefault(config, note.path);
  if (directoryDefault !== undefined) {
    return { value: directoryDefault, reason: 'directory default' };
  }

  return { value: config.visibility.default_context, reason: 'fail-closed default' };
}

/** Longest matching path-prefix wins, so a more specific directory default overrides a broader one. */
function findDirectoryDefault(config: StoreConfig, notePath: string): string | undefined {
  let best: { prefix: string; value: string } | undefined;
  for (const [prefix, value] of Object.entries(config.visibility.directory_defaults)) {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    if (notePath === prefix || notePath.startsWith(normalizedPrefix)) {
      if (!best || prefix.length > best.prefix.length) {
        best = { prefix, value };
      }
    }
  }
  return best?.value;
}
