import { SecondOpinionUsageError } from '../errors.js';
import { packagedTemplate, substituteBlock } from '../templates.js';
import type { Role } from './lineup.js';

/**
 * run-the-second-opinion-from-the-cli D4: the critic contract, the persona
 * mandates, the lens roster and the poll scaffolds are package templates
 * under `templates/second-opinion/`, reviewable as markdown. This module only
 * assembles them; it carries no prompt prose of its own.
 */
const template = (name: string): string => packagedTemplate('second-opinion', name);

export function critiquePrompt(role: Role, plan: string): string {
  return `${template('critic-contract').trimEnd()}\n\n---\n${template(`personas/${role}`).trimEnd()}\n\nPLAN:\n${plan}\n`;
}

/** The built-in lenses, by name, from the roster's `- **name** — description` lines. */
export function lensRoster(): Map<string, string> {
  const roster = new Map<string, string>();
  for (const m of template('lenses').matchAll(/^- \*\*([a-z-]+)\*\* — (.+)$/gm)) roster.set(m[1]!, m[2]!.trim());
  return roster;
}

const INLINE_LENS = /^[^:,]{1,40}:/;

/**
 * Splits `--lens` into one string per lens. Lenses are comma-separated, but an inline description may itself
 * contain commas: a fragment starts a NEW lens only when it is exactly a roster name or begins `Name:`;
 * any other fragment continues the lens before it. So `minimalist,House taste:blunt, anti-slogan` is two
 * lenses, and a description must not contain a colon (that would read as the start of another lens).
 */
export function splitLenses(spec: string, roster: ReadonlyMap<string, string>): string[] {
  const lenses: string[] = [];
  for (const fragment of spec.split(',').map((f) => f.trim()).filter(Boolean)) {
    const startsLens = roster.has(fragment.toLowerCase()) || INLINE_LENS.test(fragment);
    if (startsLens || lenses.length === 0) lenses.push(fragment);
    else lenses[lenses.length - 1] += `, ${fragment}`;
  }
  return lenses;
}

/** One `- name — description` line per lens; refuses an unknown lens and a count outside two to three. */
export function lensLines(spec: string): string[] {
  const roster = lensRoster();
  const described: string[] = [];
  for (const s of splitLenses(spec, roster)) {
    const known = roster.get(s.toLowerCase());
    if (known !== undefined) described.push(`- ${s.toLowerCase()} — ${known}`);
    else if (INLINE_LENS.test(s)) {
      const [name, ...rest] = s.split(':');
      described.push(`- ${name!.trim()} — ${rest.join(':').trim()}`);
    } else {
      throw new SecondOpinionUsageError(`unknown lens "${s}" (known: ${[...roster.keys()].join(', ')}; or pass "Name:description")`);
    }
  }
  if (described.length < 2 || described.length > 3) throw new SecondOpinionUsageError('--lens takes two or three lenses; keep them orthogonal');
  return described;
}

export function pollPrompt(question: string, opts: { lens?: string; wrap: boolean }): string {
  if (opts.lens) {
    const withLenses = substituteBlock(template('taste-panel'), '__LENSES__', lensLines(opts.lens));
    return `${substituteBlock(withLenses, '__QUESTION__', question.split('\n'))}\n`;
  }
  return opts.wrap ? `${question}\n\n${template('poll-answer')}` : question;
}
