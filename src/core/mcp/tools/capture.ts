import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { contentHash } from '../../content/canonicalize.js';
import { SOURCE_ID_FIELD, SOURCE_TYPE_FIELD } from '../../ingest/identity.js';
import { evaluateSourceCheck, type IdentityRecord } from '../../ingest/model.js';
import { missingRequiredSection } from '../../ingest/required-sections.js';
import { listCaptures, listNotes } from '../../notes/list.js';
import { parseNoteText } from '../../notes/parse.js';
import { slugifySegment } from '../../slug.js';
import { isUnderAnyPrefix } from '../../fs/prefix.js';
import { ToolRefusal } from '../jsonrpc.js';
import {
  approvalUrl,
  commitAs,
  publish,
  pullStateFor,
  removeSession,
  repoPathOf,
  sessionsLabelled,
  startSession,
  WriteRefusal,
  type Session,
  type WriteDeps,
} from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';

/**
 * remote-access spec, *`capture` opens a session pull request and never
 * writes the default branch* (design.md D9). One new inbox file, on its own
 * session, pushed as the App, with a pull request the approval page lists. A
 * capture is idempotent by source identity — derived from the content when
 * the caller names none — so a call that failed after committing resumes into
 * the same pull request instead of being refused as its own duplicate.
 */

export const MAX_CAPTURE_BODY_BYTES = 256 * 1024;
const MAX_TITLE_CHARS = 200;
const SOURCE_TYPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const CAPTURE_LABEL_PREFIX = 'capture-';

export interface CaptureArgs {
  title: string;
  body: string;
  source_type: string;
  source_id?: string;
}

/** Plain on purpose (see FIND_INPUT_SCHEMA): `parseCaptureArgs` enforces every limit. */
export const CAPTURE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short title naming the item, e.g. "Pricing review call, 14 October".' },
    body: { type: 'string', description: 'The material itself, in its own words, as markdown.' },
    source_type: { type: 'string', description: 'Where it came from, lowercased: email, meeting, web, document, …' },
    source_id: { type: 'string', description: "The source system's own id for the item (a message id, a meeting id, a URL), when there is one." },
  },
  required: ['title', 'body', 'source_type'],
} as const;

export function parseCaptureArgs(args: Record<string, unknown>): CaptureArgs {
  const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);
  if (typeof args.title !== 'string' || args.title.trim().length === 0) throw invalid('"title" is required.');
  if (args.title.length > MAX_TITLE_CHARS) throw invalid(`"title" is at most ${MAX_TITLE_CHARS} characters.`);
  if (typeof args.body !== 'string' || args.body.trim().length === 0) throw invalid('"body" is required: the material itself.');
  if (Buffer.byteLength(args.body, 'utf8') > MAX_CAPTURE_BODY_BYTES) throw invalid(`"body" is at most ${MAX_CAPTURE_BODY_BYTES} bytes; split the material into separate captures.`);
  if (typeof args.source_type !== 'string' || !SOURCE_TYPE_RE.test(args.source_type)) {
    throw invalid('"source_type" is a lowercased word naming where the material came from, e.g. "email" or "meeting".');
  }
  if (args.source_id !== undefined && args.source_id !== null && (typeof args.source_id !== 'string' || args.source_id.trim().length === 0)) {
    throw invalid('"source_id", when given, is a non-empty string.');
  }
  return {
    title: args.title.trim(),
    body: args.body,
    source_type: args.source_type,
    ...(typeof args.source_id === 'string' ? { source_id: args.source_id.trim() } : {}),
  };
}

export interface CaptureResult {
  saved: true;
  resumed: boolean;
  path: string;
  source_id: string;
  pull_request: { number: number; url: string };
  approval_url: string;
  message: string;
}

export interface CaptureContext {
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
}

/** The capture file's text: frontmatter carrying the identity the inbox requires, then the material as given. */
function captureText(args: CaptureArgs, sourceId: string): string {
  const frontmatter = stringifyYaml({ title: args.title, [SOURCE_TYPE_FIELD]: args.source_type, [SOURCE_ID_FIELD]: sourceId }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${args.body.replace(/\s+$/, '')}\n`;
}

/** The inbox file a capture session's committed tip adds, as an identity record; null when it adds none. */
async function sessionCapture(write: WriteDeps, session: Session, inbox: string): Promise<IdentityRecord | null> {
  const base = `refs/remotes/origin/${write.config.git.default_branch}`;
  const added = await write.git.run(['diff', '--name-only', '--diff-filter=A', '--no-renames', `${base}...HEAD`], { cwd: session.path, allowFailure: true });
  const prefix = await repoPathOf(write, '');
  for (const repoPath of added.stdout.split('\n').filter((p) => p.length > 0)) {
    if (!repoPath.startsWith(prefix)) continue;
    const rel = repoPath.slice(prefix.length);
    if (!isUnderAnyPrefix(rel, [inbox]) || !rel.endsWith('.md')) continue;
    const shown = await write.git.run(['show', `HEAD:${repoPath}`], { cwd: session.path, allowFailure: true });
    if (shown.exitCode !== 0) return null;
    try {
      return { path: rel, frontmatter: parseNoteText(shown.stdout, rel).frontmatter };
    } catch {
      return null;
    }
  }
  return null;
}

function pullBody(email: string, args: CaptureArgs, sourceId: string, rel: string): string {
  return [
    `Captured through the store's MCP connector by ${email}.`,
    '',
    `- Source: ${args.source_type} (\`${sourceId}\`)`,
    `- File: \`${rel}\``,
    '',
    'An inbox capture only: approving it lands the file in the inbox, where it waits to be filed into notes.',
  ].join('\n');
}

function resultFor(write: WriteDeps, session: Session, pull: { number: number; url: string }, rel: string, sourceId: string, resumed: boolean): CaptureResult {
  const approval = approvalUrl(write, session);
  return {
    saved: true,
    resumed,
    path: rel,
    source_id: sourceId,
    pull_request: { number: pull.number, url: pull.url },
    approval_url: approval,
    message: `Saved for approval as pull request #${pull.number}. It lands in the inbox once someone approves it at ${approval}.`,
  };
}

/** Run under the write mutex (design.md D9). */
export async function capture(ctx: CaptureContext, email: string, args: CaptureArgs): Promise<CaptureResult> {
  // A sync forced now, so the duplicate check sees what was pushed and opened a moment ago.
  await ctx.view.refresh(ctx.syncDeps);
  // The identity records are read under the view's lock, so a sync cannot move the view mid-read.
  const { viewConfig, viewRecords } = await ctx.view.read(ctx.syncDeps, async (snapshot) => ({
    viewConfig: snapshot.store.config,
    viewRecords: [...(await listCaptures(snapshot.store.root, snapshot.store.config)), ...(await listNotes(snapshot.store.root, snapshot.store.config))] as IdentityRecord[],
  }));
  const config = viewConfig;
  const inbox = config.ingest.inbox_path;

  const missing = missingRequiredSection(config, args.source_type, args.body);
  if (missing !== undefined) {
    throw new ToolRefusal('mcp.required_section_missing', `A ${args.source_type} capture must carry a "${missing}" section with something under it; this one does not.`, { section: missing });
  }

  // The hash is over the canonical body, which the frontmatter does not enter, so any id gives the same hash.
  const hash = contentHash(captureText(args, 'pending'), 'capture');
  const sourceId = args.source_id ?? `${args.source_type}/${hash}`;
  const pullText = (rel: string) => ({ title: `Capture: ${args.title}`, body: pullBody(email, args, sourceId, rel) });

  // Capture sessions on disk: reclaim the closed, resume the unpublished, count the open as pending.
  const pending: IdentityRecord[] = [];
  for (const session of await sessionsLabelled(ctx.write, CAPTURE_LABEL_PREFIX)) {
    const state = await pullStateFor(ctx.write, session.branch);
    if (state.kind === 'closed-unmerged') {
      await removeSession(ctx.write, session);
      continue;
    }
    if (state.kind === 'merged') continue;
    const record = await sessionCapture(ctx.write, session, inbox);
    if (record === null) continue;
    if (state.kind === 'none' && record.frontmatter?.[SOURCE_ID_FIELD] === sourceId) {
      const pull = await publish(ctx.write, session, pullText(record.path));
      return resultFor(ctx.write, session, pull, record.path, sourceId, true);
    }
    if (state.kind === 'open') pending.push({ path: `${record.path} (pull request #${state.pull.number}, awaiting approval)`, frontmatter: record.frontmatter });
  }

  const records: IdentityRecord[] = [...viewRecords, ...pending];
  const verdict = evaluateSourceCheck(records, hash, sourceId, config.ingest.tracking_params);
  if (verdict.verdict !== 'new') {
    throw new ToolRefusal('mcp.already_captured', `This material is already in the store or awaiting approval (${verdict.verdict.replace(/_/g, ' ')}): ${verdict.matches.join(', ')}. Nothing was saved.`, {
      verdict: verdict.verdict,
      matches: verdict.matches,
    });
  }

  const date = ctx.write.now().toISOString().slice(0, 10);
  const slug = slugifySegment(args.title).slice(0, 40).replace(/-+$/, '') || 'capture';
  const id = randomBytes(3).toString('hex');
  const session = await startSession(ctx.write, `${CAPTURE_LABEL_PREFIX}${slug.slice(0, 30)}-${id}`);
  // posix join: the schema accepts an inbox path with or without its trailing slash.
  const rel = path.posix.join(inbox, `${date}-${slug}-${id}.md`);
  const repoPath = await repoPathOf(ctx.write, rel);
  const absolute = path.join(session.path, repoPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, captureText(args, sourceId));
  try {
    await commitAs(ctx.write, session, email, [repoPath], `Capture: ${args.title}`, 'Captured-by');
  } catch (err) {
    await removeSession(ctx.write, session);
    throw err;
  }
  const pull = await publish(ctx.write, session, pullText(rel));
  return resultFor(ctx.write, session, pull, rel, sourceId, false);
}

/** WriteRefusal → ToolRefusal, so the client reads the reason rather than a protocol error. */
export function asToolRefusal(err: unknown): unknown {
  return err instanceof WriteRefusal ? new ToolRefusal(err.code, err.message, err.details) : err;
}
