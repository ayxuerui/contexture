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

/**
 * context-visibility spec (visibility-contexts-and-wall-verdicts): the set
 * of visibility VALUES a requesting context can see — the one shared
 * primitive every filtered consumer (graph pre-filter, disclosure rung 3)
 * calls instead of raw equality. Identity default: an unconfigured context
 * sees exactly its own value, so unconfigured stores behave exactly as
 * before the mapping existed, and unknown contexts fail closed to it.
 */
export function visibleValuesFor(config: StoreConfig, context: string): readonly string[] {
  return config.visibility.contexts[context] ?? [context];
}

/** Whether `context` can see a note whose resolved visibility is `value`. */
export function canSee(config: StoreConfig, context: string, value: string): boolean {
  return visibleValuesFor(config, context).includes(value);
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
