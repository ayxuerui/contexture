import type { StoreConfig } from '../../config/schema.js';
import type { Note } from '../notes/list.js';
import { canSee, resolveVisibility } from '../notes/visibility.js';

export interface LeakFinding {
  path: string;
  context: string;
  pattern: string;
  matchedText: string;
}

/**
 * disclosure-policy spec (store-primitives-from-migration-audit D3): a leak
 * is content that belongs to context X (per an operator-declared marker
 * pattern) inside a note X cannot see, per the SAME context→visible-values
 * mapping the visibility pre-filter and disclosure's internal-audience rung
 * use — "X cannot see the note" is exactly `!canSee(config, X, resolved)`.
 * Empty markers (the default) make this a no-op for every note.
 */
export function scanNoteForLeaks(config: StoreConfig, note: Note): LeakFinding[] {
  const markers = config.disclosure.leak_markers;
  if (Object.keys(markers).length === 0) return [];

  const resolved = resolveVisibility(config, note).value;
  const findings: LeakFinding[] = [];
  for (const [context, patterns] of Object.entries(markers)) {
    if (canSee(config, context, resolved)) continue;
    for (const pattern of patterns) {
      const match = new RegExp(pattern).exec(note.body);
      if (match) {
        findings.push({ path: note.path, context, pattern, matchedText: match[0] });
      }
    }
  }
  return findings;
}

export function scanForLeaks(config: StoreConfig, notes: readonly Note[]): LeakFinding[] {
  return notes.flatMap((note) => scanNoteForLeaks(config, note));
}
