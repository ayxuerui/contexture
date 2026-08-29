import type { HardWallConfig, StoreConfig } from '../../config/schema.js';
import type { Note } from '../notes/list.js';
import { canSee, resolveVisibility } from '../notes/visibility.js';

export type DisclosureVerdict = 'allow' | 'deny' | 'ask';

export type DisclosureRung = 'hard_wall' | 'explicit_tag' | 'internal_visibility' | 'external_default';

export interface DisclosureResult {
  verdict: DisclosureVerdict;
  rung: DisclosureRung;
}

/**
 * The frontmatter key a note uses to explicitly declare which audiences may
 * see it disclosed (rung 2). Unlike the visibility field (context-store
 * spec), nothing asks this key to be configurable, so it lives here as the
 * one literal — same discipline as every other single-purpose constant in
 * this codebase, just without a dedicated defaults.ts entry since no other
 * module needs to reference it.
 */
const AUDIENCE_FIELD_KEY = 'audience';

function matchesWall(wall: HardWallConfig, note: Note, audience: string): boolean {
  if (wall.audience !== '*' && wall.audience !== audience) return false;
  if (wall.except?.includes(audience)) return false;
  if (!wall.note_path_prefix) return true;
  const prefix = wall.note_path_prefix.endsWith('/') ? wall.note_path_prefix : `${wall.note_path_prefix}/`;
  return note.path === wall.note_path_prefix || note.path.startsWith(prefix);
}

/**
 * disclosure-policy spec: ordered walls-before-allows evaluation, stopping
 * at the first rung that produces a verdict. Rung 3 (internal-audience-
 * from-visibility) only applies when the requested audience is one the
 * operator has declared internal — for any other (external) audience, rung
 * 3 is skipped entirely and evaluation falls straight to rung 4's ASK, so an
 * external verdict is never derived from visibility alone.
 */
export function evaluateDisclosure(config: StoreConfig, note: Note, audience: string): DisclosureResult {
  for (const wall of config.disclosure.hard_walls) {
    if (matchesWall(wall, note, audience)) {
      return { verdict: wall.verdict, rung: 'hard_wall' };
    }
  }

  const tags = note.frontmatter?.[AUDIENCE_FIELD_KEY];
  if (Array.isArray(tags) && tags.includes(audience)) {
    return { verdict: 'allow', rung: 'explicit_tag' };
  }

  if (config.disclosure.internal_audiences.includes(audience)) {
    const resolved = resolveVisibility(config, note);
    return { verdict: canSee(config, audience, resolved.value) ? 'allow' : 'deny', rung: 'internal_visibility' };
  }

  return { verdict: 'ask', rung: 'external_default' };
}
