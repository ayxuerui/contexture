import type { Finding } from '../envelope.js';
import { NOTE_TEMPLATE_PLACEHOLDERS } from '../note-templates.js';
import { defineCheck } from './types.js';

/**
 * context-store spec ("A note template's placeholder vocabulary"): a note that
 * reached the store still carrying a template placeholder was never finished.
 *
 * An observation, never an invariant: the note is readable and valid, it just
 * has a hole in it. And it matches the ENUMERATED vocabulary only — a note may
 * legitimately quote another tool's double-brace syntax, and a check that
 * reports those is one operators learn to ignore.
 */
export const unsubstitutedPlaceholderCheck = defineCheck({
  id: 'store.unsubstituted_placeholder',
  title: 'Notes still carrying a template placeholder',
  severity: 'observation',
  capability: 'context-store',
  scopes: ['store'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const note of await ctx.notes()) {
      const haystack = [note.body, ...Object.values(note.frontmatter ?? {}).map((v) => (typeof v === 'string' ? v : ''))].join('\n');
      const found = NOTE_TEMPLATE_PLACEHOLDERS.filter((token) => haystack.includes(token));
      if (found.length === 0) continue;
      findings.push({
        code: 'store.unsubstituted_placeholder',
        severity: 'info',
        message: `"${note.path}" still carries the template placeholder ${found.join(', ')}.`,
        subject: note.path,
        details: { placeholders: found },
      });
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const STORE_CHECKS = [unsubstitutedPlaceholderCheck];
