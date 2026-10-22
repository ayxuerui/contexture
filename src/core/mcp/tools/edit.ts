import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../../../config/load.js';
import { MIGRATION_STEPS } from '../../../config/migrations.js';
import { buildCatalog } from '../../catalog/build.js';
import { InvalidNoteFrontmatterError } from '../../errors.js';
import { admitsNotePath } from '../../notes/list.js';
import { parseNoteText } from '../../notes/parse.js';
import { draftLabel, findDraft } from '../drafts.js';
import { ToolRefusal } from '../jsonrpc.js';
import { approvalUrl, commitAs, publish, removeSession, repoPathOf, startSession, type Session, type WriteDeps } from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';
import { resolveStorePath } from './files.js';

/**
 * serve-the-store-over-mcp design.md D13 (remote-access spec, *`Edit` and
 * `Write` collect in one draft pull request per member*): Claude Code's Edit
 * and Write, landing as commits on the member's draft — one session, one pull
 * request, reviewed on the approval page. A call first publishes whatever the
 * draft left unpublished, and a retry whose effect is already in the draft is
 * answered without a second commit, so a failure partway never strands a change.
 */

export interface EditArgs {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface WriteArgs {
  file_path: string;
  content: string;
}

export const EDIT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The note to modify, relative to the store root, e.g. "projects/kestrel.md".' },
    old_string: { type: 'string', description: 'The text to replace' },
    new_string: { type: 'string', description: 'The text to replace it with (must be different from old_string)' },
    replace_all: { type: 'boolean', description: 'Replace all occurrences of old_string (default false)' },
  },
  required: ['file_path', 'old_string', 'new_string'],
} as const;

export const WRITE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The new note to create, relative to the store root, e.g. "projects/kestrel-launch.md".' },
    content: { type: 'string', description: 'The content to write to the note' },
  },
  required: ['file_path', 'content'],
} as const;

const MAX_CONTENT_BYTES = 256 * 1024;

export function parseEditArgs(args: Record<string, unknown>): EditArgs {
  const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);
  if (typeof args.file_path !== 'string' || args.file_path.trim() === '') throw invalid('"file_path" is required.');
  if (typeof args.old_string !== 'string' || args.old_string === '') throw invalid('"old_string" is required and cannot be empty.');
  if (typeof args.new_string !== 'string') throw invalid('"new_string" is required.');
  if (args.old_string === args.new_string) throw invalid('"new_string" must be different from "old_string".');
  if (args.replace_all !== undefined && args.replace_all !== null && typeof args.replace_all !== 'boolean') throw invalid('"replace_all" must be true or false.');
  return { file_path: args.file_path, old_string: args.old_string, new_string: args.new_string, replace_all: args.replace_all === true };
}

export function parseWriteArgs(args: Record<string, unknown>): WriteArgs {
  const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);
  if (typeof args.file_path !== 'string' || args.file_path.trim() === '') throw invalid('"file_path" is required.');
  if (typeof args.content !== 'string' || args.content.trim() === '') throw invalid('"content" is required.');
  if (Buffer.byteLength(args.content, 'utf8') > MAX_CONTENT_BYTES) throw invalid(`"content" is at most ${MAX_CONTENT_BYTES} bytes.`);
  return { file_path: args.file_path, content: args.content };
}

export interface DraftContext {
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
}

export interface DraftResult {
  file_path: string;
  changed: boolean;
  /** Set when a retried call's effect was already in the draft: nothing new was committed. */
  already_applied: boolean;
  commit: string;
  pull_request: { number: number; url: string };
  approval_url: string;
  message: string;
}

/** design.md D13: editable means the note enumeration would admit it — markdown, outside the capture tier and every tool-owned path. */
function editablePath(input: string, config: SyncDeps['config']): string {
  const rel = resolveStorePath(input, config);
  if (!admitsNotePath(rel, config)) {
    throw new ToolRefusal('mcp.path_not_editable', `"${rel}" is not a note that can be edited here: only markdown notes are, never configuration, captures, the entry document or tool-owned files.`);
  }
  return rel;
}

function pullText(email: string): { title: string; body: string } {
  return {
    title: `Edits by ${email}`,
    body: [
      `Edits made through the store's MCP connector by ${email}.`,
      '',
      'Each commit is one Edit or Write. Changes made after an approval need approving again.',
    ].join('\n'),
  };
}

async function existing(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function pathExists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

/** The member's draft as it stands, publishing anything it left unpublished; null when there is none to extend. */
async function currentDraft(ctx: DraftContext, email: string): Promise<Session | null> {
  const draft = await findDraft(ctx.write, email);
  if (draft === null) return null;
  if (draft.state.kind === 'closed-unmerged' || draft.state.kind === 'merged') {
    await removeSession(ctx.write, draft.session);
    return null;
  }
  await publish(ctx.write, draft.session, pullText(email));
  return draft.session;
}

async function finish(ctx: DraftContext, email: string, session: Session, rel: string, commit: string, alreadyApplied: boolean): Promise<DraftResult> {
  const pull = await publish(ctx.write, session, pullText(email));
  const approval = approvalUrl(ctx.write, session);
  return {
    file_path: rel,
    changed: !alreadyApplied,
    already_applied: alreadyApplied,
    commit,
    pull_request: { number: pull.number, url: pull.url },
    approval_url: approval,
    message: alreadyApplied
      ? `That change is already in your draft (pull request #${pull.number}); nothing new was committed.`
      : `Saved to your draft, pull request #${pull.number}. It lands once someone approves it at ${approval}.`,
  };
}

/** Applies `next` to `rel` in the draft (starting one if needed), rebuilds the catalog, commits as the member. Under the write mutex. */
async function applyToDraft(ctx: DraftContext, email: string, rel: string, verb: 'Edit' | 'Write', compute: (current: string | null) => { text: string } | { alreadyApplied: true }): Promise<DraftResult> {
  await ctx.view.refresh(ctx.syncDeps);
  const viewRoot = (await ctx.view.read(ctx.syncDeps, async (snapshot) => ({ root: snapshot.store.root }))).root;
  let session = await currentDraft(ctx, email);
  const fresh = session === null;
  const repoPath = await repoPathOf(ctx.write, rel);

  // Decide against what the member is editing: the draft's copy when there is a draft, else the served commit.
  const before = session === null ? await existing(path.join(viewRoot, rel)) : await existing(path.join(session.path, repoPath));
  const outcome = compute(before);
  if ('alreadyApplied' in outcome) {
    if (session === null) throw new ToolRefusal('mcp.edit_failed', 'Nothing to apply.');
    const tip = (await ctx.write.git.run(['rev-parse', 'HEAD'], { cwd: session.path })).stdout.trim();
    return finish(ctx, email, session, rel, tip, true);
  }
  try {
    parseNoteText(outcome.text, rel);
  } catch (err) {
    const reason = err instanceof InvalidNoteFrontmatterError ? err.finding.message : err instanceof Error ? err.message : String(err);
    throw new ToolRefusal('mcp.not_a_note', `The result would not be a valid note, so nothing was saved: ${reason}`);
  }

  session ??= await startSession(ctx.write, draftLabel(email));
  try {
    const absolute = path.join(session.path, repoPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, outcome.text);
    // The catalog follows the change, as it would in an agent's session (design.md D13).
    const draftStoreRoot = path.join(session.path, await repoPathOf(ctx.write, ''));
    const draftConfig = await readConfig(draftStoreRoot, MIGRATION_STEPS);
    await buildCatalog({ root: draftStoreRoot, config: draftConfig });
    const catalogPath = await repoPathOf(ctx.write, draftConfig.catalog.path);
    const paths = (await pathExists(path.join(session.path, catalogPath))) ? [repoPath, catalogPath] : [repoPath];
    const commit = await commitAs(ctx.write, session, email, paths, `${verb} ${rel}`, 'Edited-by');
    return await finish(ctx, email, session, rel, commit, false);
  } catch (err) {
    if (fresh) {
      const commits = (await ctx.write.git.run(['rev-list', '--count', `refs/remotes/origin/${ctx.write.config.git.default_branch}..HEAD`], { cwd: session.path, allowFailure: true })).stdout.trim();
      if (commits === '0') await removeSession(ctx.write, session);
    }
    throw err;
  }
}

export async function editTool(ctx: DraftContext, email: string, args: EditArgs): Promise<DraftResult> {
  const rel = editablePath(args.file_path, ctx.syncDeps.config);
  return applyToDraft(ctx, email, rel, 'Edit', (current) => {
    if (current === null) throw new ToolRefusal('mcp.file_not_found', `"${rel}" does not exist. Use Write to create a new note.`);
    const count = current.split(args.old_string).length - 1;
    if (count === 0) {
      if (current.includes(args.new_string)) return { alreadyApplied: true };
      throw new ToolRefusal('mcp.edit_failed', `old_string was not found in "${rel}". Read the note again and copy the text exactly.`);
    }
    if (count > 1 && args.replace_all !== true) {
      throw new ToolRefusal('mcp.edit_failed', `old_string occurs ${count} times in "${rel}". Include more surrounding text to make it unique, or set replace_all.`, { occurrences: count });
    }
    return { text: args.replace_all === true ? current.split(args.old_string).join(args.new_string) : current.replace(args.old_string, () => args.new_string) };
  });
}

export async function writeTool(ctx: DraftContext, email: string, args: WriteArgs): Promise<DraftResult> {
  const rel = editablePath(args.file_path, ctx.syncDeps.config);
  const viewRoot = (await ctx.view.read(ctx.syncDeps, async (snapshot) => ({ root: snapshot.store.root }))).root;
  if ((await existing(path.join(viewRoot, rel))) !== null) {
    throw new ToolRefusal('mcp.file_exists', `"${rel}" already exists. Write only creates new notes; use Edit to change it.`);
  }
  const text = args.content.endsWith('\n') ? args.content : `${args.content}\n`;
  return applyToDraft(ctx, email, rel, 'Write', (current) => {
    if (current === null) return { text };
    if (current === text) return { alreadyApplied: true };
    throw new ToolRefusal('mcp.file_exists', `"${rel}" already exists in your draft. Write only creates new notes; use Edit to change it.`);
  });
}
