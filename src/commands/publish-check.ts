import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PublishPageNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { parseNoteText } from '../core/notes/parse.js';
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
  ];

  if (!existsSync(readmePath)) {
    failures.push({ check: 'sibling-readme', message: `no sibling README at "${readmeRelativePath}"` });
  } else {
    const readmeRaw = await readFile(readmePath, 'utf8');
    const readmeNote = parseNoteText(readmeRaw, readmeRelativePath);
    if (readmeNote.frontmatter?.kind !== undefined) {
      failures.push({ check: 'readme-frontmatter', message: 'README declares a "kind" field — a page\'s kind is the folder name alone' });
    }
  }

  failures.push(...(await checkInlineScriptSyntax(html)));

  return {
    exitCode: failures.length === 0 ? ExitCode.Ok : ExitCode.CheckFailed,
    data: { path: relativePath, passed: failures.length === 0, failures },
    findings: [],
    humanSummary:
      failures.length === 0
        ? `${relativePath}: all checks passed.`
        : `${relativePath}: ${failures.length} failing check(s): ${failures.map((f) => f.check).join(', ')}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
