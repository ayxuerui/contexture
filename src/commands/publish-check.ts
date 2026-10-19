import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pageServedAt, type ServedAt, servedAtSentence } from '../core/browse/page-url.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PublishPageNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { listNotes, type Note } from '../core/notes/list.js';
import { parseNoteText } from '../core/notes/parse.js';
import { DISPOSABLE_SEGMENT, lifespanOf, type PageLifespan, parseDisposableDate } from '../core/publish/lifespan.js';
import { assessRepresentation } from '../core/publish/represents.js';
import { checkScriptSyntax } from '../core/publish/script-check.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishCheckFlags {
  path: string;
}

export interface PublishCheckFailure {
  check: string;
  message: string;
}

export interface PublishCheckData {
  path: string;
  passed: boolean;
  failures: PublishCheckFailure[];
  /**
   * Where the browsing surface answers for the checked page. Null for a file
   * outside the configured publish path — no route in the store serves it,
   * which is the same verdict `checkPageLocation` reaches for such a file.
   */
  served_at: ServedAt | null;
  /**
   * two-kinds-of-published-page: read from where the page is filed. Null for a
   * file outside the configured publish path, which is not a page.
   */
  lifespan: PageLifespan | null;
}

/** publish spec: the fixed tag list a tag-balance pass counts, matching the source convention's checker. */
const BALANCE_TAGS = ['section', 'div', 'h1', 'h2', 'h3', 'h4', 'article', 'header', 'main', 'nav', 'aside', 'footer', 'ul', 'ol', 'li', 'p', 'table', 'tr', 'td', 'th'];

function stripNonStructural(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

function checkNoExternalReferences(html: string): PublishCheckFailure[] {
  const match = /(?:src|href)\s*=\s*["']https?:\/\/[^"']*["']/i.exec(html);
  if (!match) return [];
  return [{ check: 'no-external-references', message: `references an external network resource: ${match[0]}` }];
}

function checkViewportMeta(html: string): PublishCheckFailure[] {
  if (/<meta[^>]*name\s*=\s*["']viewport["']/i.test(html)) return [];
  return [{ check: 'viewport-meta', message: 'no <meta name="viewport"> tag' }];
}

function checkPrintRule(html: string): PublishCheckFailure[] {
  if (/@media\s+print/i.test(html)) return [];
  return [{ check: 'print-rule', message: 'no @media print rule' }];
}

/** publish spec: the nav's page label reads this field (serve-page-names-theme-and-nav-toggle D1), so it must be enforced rather than merely hoped for. */
function checkTitle(html: string): PublishCheckFailure[] {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match && (match[1] ?? '').trim().length > 0) return [];
  return [{ check: 'title', message: 'no non-empty <title> element' }];
}

/**
 * publish spec / file-published-pages-by-location design.md D1–D2: the page's
 * filing *shape*, and nothing more. It fires only when the page folder is an
 * immediate child of the configured publish path, and never names a parent the
 * page should have had — which grouping directory is correct depends on where
 * the subject's notes live and, for a subject whose sources aren't co-located,
 * on a reading of the subject. Neither is derivable from the file being
 * checked, and this command answers only what is (D1). Depth beyond one
 * grouping directory passes: the publish spec already blesses a slug of any
 * depth, so the check is a floor rather than the convention (D2), which the
 * publish skill states instead.
 *
 * A checked file outside the configured publish path entirely reports nothing
 * here — it is not a published page, so it has no filing to judge.
 */
function checkPageLocation(relativePath: string, publishPath: string): PublishCheckFailure[] {
  const publishPrefix = publishPath.split(path.sep).join('/').replace(/\/+$/, '');
  if (!relativePath.startsWith(`${publishPrefix}/`)) return [];

  const underPublish = relativePath.slice(publishPrefix.length + 1);
  const pageFolder = underPublish.slice(0, Math.max(underPublish.lastIndexOf('/'), 0));
  if (pageFolder.includes('/')) return [];

  return [
    {
      check: 'page-location',
      message: `filed directly at the configured publish path ("${publishPrefix}/") — a page belongs inside a grouping directory under it`,
    },
  ];
}

/**
 * two-kinds-of-published-page D2: a disposable page sits exactly one level
 * under the reserved segment, its name led by the date `publish new
 * --disposable` stamped. Anything else filed under the segment — a permanent
 * page placed there by hand, a nested folder — is disposable by location and
 * fails here, so the misfiling is named without knowing the author's intent.
 */
function checkDisposableShape(relativePath: string, publishPath: string): PublishCheckFailure[] {
  const publishPrefix = publishPath.split(path.sep).join('/').replace(/\/+$/, '');
  const pageFolder = path.posix.dirname(relativePath.slice(publishPrefix.length + 1));
  const segments = pageFolder.split('/');
  if (segments.length === 2 && segments[0] === DISPOSABLE_SEGMENT && parseDisposableDate(segments[1]!) !== null) return [];
  return [
    {
      check: 'disposable-shape',
      message: `a disposable page sits directly under "${publishPrefix}/${DISPOSABLE_SEGMENT}/" in a folder named "<YYYY-MM-DD>-<name>" with a real date; this one is at "${publishPrefix}/${pageFolder}"`,
    },
  ];
}

/**
 * two-kinds-of-published-page D4/D5: a permanent page names the one note it
 * represents — its README's lead link — and records that note's hash, so a
 * change to the note after the page was built is reported, not remembered.
 */
function checkRepresentation(readmeRaw: string, readmePath: string, notes: readonly Note[]): PublishCheckFailure[] {
  const representation = assessRepresentation(readmeRaw, readmePath, notes);
  switch (representation.status) {
    case 'no-link':
      return [{ check: 'represented-note', message: 'the README names no note: lead its source notes with a wikilink to the one note this page represents' }];
    case 'not-found':
      return [{ check: 'represented-note', message: `the README's first wikilink names "${representation.target}", which no note in the store carries` }];
    case 'ambiguous':
      return [
        {
          check: 'represented-note',
          message: `the README's first wikilink "${representation.target}" resolves to more than one note: ${representation.candidates.join(', ')}`,
        },
      ];
    case 'not-stamped':
      return [{ check: 'represented-note-hash', message: `not stamped: run "ctxr publish stamp" to record the hash of "${representation.note}"` }];
    case 'stale':
      return [
        {
          check: 'represented-note-hash',
          message: `stale: "${representation.note}" has changed since the page was stamped — review the page against it, remove the marker, and stamp again`,
        },
      ];
    case 'current':
      return [];
  }
}

/**
 * two-kinds-of-published-page: the summary names a failing check by its id,
 * plus — for the hash check — which of its two reasons applies, because "not
 * stamped" and "stale" ask the author for different things (stamp, versus
 * review then remove the marker then stamp).
 */
function summaryLabel(failure: PublishCheckFailure): string {
  if (failure.check !== 'represented-note-hash') return failure.check;
  return `${failure.check} (${failure.message.startsWith('stale') ? 'stale' : 'not stamped'})`;
}

function checkProvenanceLine(html: string): PublishCheckFailure[] {
  const hasDate = /\d{4}-\d{2}-\d{2}/.test(html);
  const hasReadmeLink = /href\s*=\s*["'][^"']*readme[^"']*["']/i.test(html);
  if (hasDate && hasReadmeLink) return [];
  return [{ check: 'provenance-line', message: 'no provenance line pairing a date with a link to the sibling README' }];
}

function checkTagBalance(html: string): PublishCheckFailure[] {
  const stripped = stripNonStructural(html);
  const failures: PublishCheckFailure[] = [];
  for (const tag of BALANCE_TAGS) {
    const open = (stripped.match(new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi')) ?? []).length;
    const close = (stripped.match(new RegExp(`</${tag}\\s*>`, 'gi')) ?? []).length;
    if (open !== close) failures.push({ check: 'tag-balance', message: `<${tag}>: open=${open} close=${close}` });
  }
  return failures;
}

function extractInlineScripts(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue; // external — already caught by checkNoExternalReferences if http(s)
    const body = (match[2] ?? '').trim();
    if (body.length > 0) blocks.push(body);
  }
  return blocks;
}

async function checkInlineScriptSyntax(html: string): Promise<PublishCheckFailure[]> {
  const scripts = extractInlineScripts(html);
  const errors = await checkScriptSyntax(scripts);
  return errors.map((e) => ({ check: 'script-syntax', message: `script block #${e.index}: ${e.message}` }));
}

/**
 * publish spec: the mechanized half of the page-checklist — every check
 * answerable from the file and its sibling README alone, never a caller-
 * supplied assertion (the source convention's `--expect NEEDLE=COUNT` mode
 * is deliberately not carried forward; see design.md).
 */
export async function execute(store: Store, flags: PublishCheckFlags): Promise<CommandOutcome<PublishCheckData>> {
  const absolutePath = path.isAbsolute(flags.path) ? flags.path : path.resolve(store.root, flags.path);
  const relativePath = path.relative(store.root, absolutePath).split(path.sep).join('/');

  if (!existsSync(absolutePath)) {
    throw new PublishPageNotFoundError(relativePath);
  }

  const html = await readFile(absolutePath, 'utf8');
  const pageDir = path.dirname(absolutePath);
  const readmePath = path.join(pageDir, 'README.md');
  const readmeRelativePath = path.relative(store.root, readmePath).split(path.sep).join('/');

  const failures: PublishCheckFailure[] = [
    ...checkNoExternalReferences(html),
    ...checkViewportMeta(html),
    ...checkPrintRule(html),
    ...checkProvenanceLine(html),
    ...checkTitle(html),
    ...checkTagBalance(html),
    ...checkPageLocation(relativePath, store.config.publish.path),
  ];

  const lifespan = lifespanOf(relativePath, store.config.publish.path);
  if (lifespan === 'disposable') failures.push(...checkDisposableShape(relativePath, store.config.publish.path));

  if (!existsSync(readmePath)) {
    failures.push({ check: 'sibling-readme', message: `no sibling README at "${readmeRelativePath}"` });
  } else {
    const readmeRaw = await readFile(readmePath, 'utf8');
    const readmeNote = parseNoteText(readmeRaw, readmeRelativePath);
    if (readmeNote.frontmatter?.kind !== undefined) {
      failures.push({ check: 'readme-frontmatter', message: 'README declares a "kind" field — a page\'s kind is the folder name alone' });
    }
    if (lifespan === 'permanent') {
      // Loaded once per run (tasks 4.1); the check still writes nothing.
      const notes = await listNotes(store.root, store.config);
      failures.push(...checkRepresentation(readmeRaw, readmeRelativePath, notes));
    }
  }

  failures.push(...(await checkInlineScriptSyntax(html)));

  // Reported on both exit paths: a page whose checks failed is exactly the one
  // somebody needs to open, and naming its address gates nothing.
  const servedAt = pageServedAt(store, relativePath);
  const sentence = servedAtSentence(servedAt);
  const lifespanTag = lifespan === null ? '' : ` (${lifespan})`;

  return {
    exitCode: failures.length === 0 ? ExitCode.Ok : ExitCode.CheckFailed,
    data: { path: relativePath, passed: failures.length === 0, failures, served_at: servedAt, lifespan },
    findings: [],
    humanSummary:
      failures.length === 0
        ? `${relativePath}${lifespanTag}: all checks passed.${sentence}`
        : `${relativePath}${lifespanTag}: ${failures.length} failing check(s): ${failures.map(summaryLabel).join(', ')}.${sentence}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
