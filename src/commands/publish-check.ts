import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pageServedAt, type ServedAt, servedAtSentence } from '../core/browse/page-url.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PUBLISH_INDEX_FILE } from '../core/browse/routes.js';
import { PublishPageNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { listNotes, type Note } from '../core/notes/list.js';
import { parseNoteText } from '../core/notes/parse.js';
import { DISPOSABLE_SEGMENT, lifespanOf, type PageLifespan, parseLeadingDate } from '../core/publish/lifespan.js';
import { assessRepresentation } from '../core/publish/represents.js';
import { checkScriptSyntax } from '../core/publish/script-check.js';
import { sendCopiesAtPageRoot, sendCopyExtension, sendCopyNameProblem } from '../core/publish/send-copies.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishCheckFlags {
  path: string;
}

export interface PublishCheckFailure {
  check: string;
  message: string;
}

/** send-copies-beside-their-page: a send copy at a page folder's root. */
export interface PublishCheckSendCopy {
  /** Store-relative. */
  path: string;
  served_at: ServedAt | null;
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
  /**
   * file-pdfs-beside-their-page D5: every send copy at the page folder's root,
   * sorted by file name, with the address it is served at — so the author can
   * hand on its link. A file in a subfolder is an input and is not listed.
   */
  send_copies: PublishCheckSendCopy[];
}

/** publish spec: the fixed tag list a tag-balance pass counts, matching the source convention's checker. */
const BALANCE_TAGS = ['section', 'div', 'h1', 'h2', 'h3', 'h4', 'article', 'header', 'main', 'nav', 'aside', 'footer', 'ul', 'ol', 'li', 'p', 'table', 'tr', 'td', 'th'];

function stripNonStructural(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

const EXTERNAL_ADDRESS = /^\s*https?:\/\//i;

/** allow-outbound-links-in-published-pages D1: attributes whose value an element loads, on any element. */
const LOADING_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'data']);

/** D1: the elements whose `href` is navigation only. Every other `href` loads or re-bases what it names. */
const NAVIGATING_ELEMENTS = new Set(['a', 'area']);

function loadsExternally(element: string, attribute: string, value: string): boolean {
  if (attribute === 'srcset') return value.split(',').some((candidate) => EXTERNAL_ADDRESS.test(candidate));
  if (LOADING_ATTRIBUTES.has(attribute)) return EXTERNAL_ADDRESS.test(value);
  if (attribute === 'href' || attribute.endsWith(':href')) return !NAVIGATING_ELEMENTS.has(element) && EXTERNAL_ADDRESS.test(value);
  return false;
}

/**
 * publish spec: a page loads nothing from an external address. An outbound
 * `<a href>` loads nothing until a reader follows it, so it passes (D1); an
 * external CSS `url()` or `@import` loads as surely as `<link href>`, so it
 * fails (D2). The first match is named (D3).
 */
function checkNoExternalReferences(html: string): PublishCheckFailure[] {
  const fail = (text: string): PublishCheckFailure[] => [{ check: 'no-external-references', message: `references an external network resource: ${text}` }];

  const tagRe = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const attrRe = /([^\s"'=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html))) {
    const element = tag[1]!.toLowerCase();
    let attr: RegExpExecArray | null;
    while ((attr = attrRe.exec(tag[2] ?? ''))) {
      const value = attr[2] ?? attr[3] ?? attr[4] ?? '';
      if (loadsExternally(element, attr[1]!.toLowerCase(), value)) return fail(attr[0]);
    }
  }

  const css = /(?:url\(\s*(?:&quot;|["'])?|@import\s+["'])\s*https?:\/\/[^"')\s]*/i.exec(html);
  return css ? fail(css[0]) : [];
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
  if (segments.length === 2 && segments[0] === DISPOSABLE_SEGMENT && parseLeadingDate(segments[1]!) !== null) return [];
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

function checkSendCopyNames(sendCopyFileNames: readonly string[]): PublishCheckFailure[] {
  return sendCopyFileNames.flatMap((name) => {
    const problem = sendCopyNameProblem(name);
    return problem === null ? [] : [{ check: 'send-copy-name', message: problem }];
  });
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
  const namedPath = path.isAbsolute(flags.path) ? flags.path : path.resolve(store.root, flags.path);
  // file-pdfs-beside-their-page D5: naming a page's send copy checks the page.
  const absolutePath = sendCopyExtension(namedPath) !== null ? path.join(path.dirname(namedPath), PUBLISH_INDEX_FILE) : namedPath;
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

  const sendCopyFileNames = await sendCopiesAtPageRoot(pageDir);
  failures.push(...checkSendCopyNames(sendCopyFileNames));

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
  const pageDirRelative = path.posix.dirname(relativePath);
  const sendCopies = sendCopyFileNames.map((name) => {
    const sendCopyPath = `${pageDirRelative}/${name}`;
    return { path: sendCopyPath, served_at: pageServedAt(store, sendCopyPath) };
  });
  const sendCopyTag = sendCopies.length === 0 ? '' : ` ${sendCopies.length} send copy(ies).`;

  return {
    exitCode: failures.length === 0 ? ExitCode.Ok : ExitCode.CheckFailed,
    data: { path: relativePath, passed: failures.length === 0, failures, served_at: servedAt, lifespan, send_copies: sendCopies },
    findings: [],
    humanSummary:
      failures.length === 0
        ? `${relativePath}${lifespanTag}: all checks passed.${sendCopyTag}${sentence}`
        : `${relativePath}${lifespanTag}: ${failures.length} failing check(s): ${failures.map(summaryLabel).join(', ')}.${sendCopyTag}${sentence}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
