import type { ServedAtRoute } from '../browse/page-url.js';
import { packagedTemplate, substituteBlock } from '../templates.js';
import { isEmptyDelta, type GraphDelta } from './diff.js';

/**
 * review-the-knowledge-diff (D9): the **Knowledge changes** block a pull
 * request body carries verbatim, written by the command so the party under
 * review writes none of it. It names both commits in full and the command
 * that reproduces it, gives every kind as a count, and lists in full the two
 * kinds most likely to be silent losses: introduced dangling links and
 * archived notes. It carries no diagram and no judgment the delta does not
 * make.
 *
 * Every fixed sentence lives in `templates/graph/knowledge-changes/`; this
 * module fills in values only.
 */
function template(name: string): string {
  return packagedTemplate('graph/knowledge-changes', name);
}

/** The reasons a dangling link carries a template for; any other reason is written as the delta names it. */
const REASON_TEMPLATES: ReadonlySet<string> = new Set(['not_found', 'ambiguous']);

function reasonText(reason: string): string {
  return REASON_TEMPLATES.has(reason) ? template(`reason-${reason}`) : reason;
}

/** Fills `__TOKEN__` slots; a function replacement, so a `$` in a path is never read as a pattern. */
function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((out, [token, value]) => out.replaceAll(`__${token}__`, () => value), text);
}

function code(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${text.startsWith('`') || text.endsWith('`') ? ` ${text} ` : text}${fence}`;
}

function bodyLines(delta: GraphDelta): string[] {
  if (isEmptyDelta(delta)) return template('empty').split('\n');

  const counts = Object.entries(delta.counts).reduce(
    (text, [key, count]) => text.replaceAll(`__${key.toUpperCase()}__`, String(count)),
    template('counts'),
  );
  const lines = counts.split('\n');
  if (delta.dangling.introduced.length > 0) {
    lines.push('', ...template('dangling').split('\n'), '');
    for (const d of delta.dangling.introduced) {
      lines.push(fill(template('dangling-item'), { FROM: code(d.from), TARGET: code(d.target), REASON: reasonText(d.reason) }));
    }
  }
  if (delta.notes.archived.length > 0) {
    lines.push('', ...template('archived').split('\n'), '');
    for (const r of delta.notes.archived) lines.push(fill(template('archived-item'), { FROM: code(r.from), TO: code(r.to) }));
  }
  return lines;
}

/** The review address with its reachability line, and the bare-route line when no base URL is declared; empty without an address. */
export function reviewLines(review: ServedAtRoute | null): string[] {
  if (review === null) return [];
  const text = template('review').replace('__ADDRESS__', () => review.url ?? review.route);
  return ['', ...substituteBlock(text, '__BARE_ROUTE__', review.url === null ? template('bare-route').split('\n') : []).split('\n')];
}

export function renderKnowledgeChangesBlock(delta: GraphDelta, review: ServedAtRoute | null): string {
  let text = template('block').replaceAll('__BASE__', delta.base).replaceAll('__HEAD__', delta.head);
  text = substituteBlock(text, '__BODY__', bodyLines(delta));
  text = substituteBlock(text, '__REVIEW__', reviewLines(review));
  return `${text}\n`;
}
