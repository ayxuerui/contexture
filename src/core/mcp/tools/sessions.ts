import { ContextureError } from '../../errors.js';
import { discardSession } from '../../session/discard.js';
import { listSessions } from '../../session/list.js';
import { rebaseSession, type RebaseMode } from '../../session/rebase.js';
import { rebaseInProgress } from '../../session/resolve.js';
import { sessionStatus } from '../../session/status.js';
import { submitSession } from '../../session/submit.js';
import { sessionLabelFromDirName } from '../../session.js';
import { ToolRefusal } from '../jsonrpc.js';
import { memberSessions, ownedSession, ownershipOf, repoPrefixOf, sessionRootFor, type MemberSession } from '../member-sessions.js';
import { MAX_OPEN_SESSIONS } from '../ownership.js';
import { approvalUrl, memberCommit, startSession, type WriteDeps } from '../sessions.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D3 (remote-access spec, *A member
 * works in named sessions of their own*, *`session_submit` validates, commits
 * as the member and opens the pull request*, *A member's session can be
 * rebased or discarded*): one tool per `ctxr session <verb>`, each calling the
 * same core the command calls, with the command's options as fields. The MCP
 * layer adds the ownership check, the member as commit author, and the
 * confinement to sessions started over MCP. Server paths never leave: a
 * session is named by its directory and addressed by its store-relative root.
 */

/** D3: `session_status`'s unified diff is bounded to this many bytes. */
export const STATUS_DIFF_MAX_BYTES = 100 * 1024;

const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw invalid(`"${key}" must be a string.`);
  return value;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key);
  if (value === undefined || value.trim() === '') throw invalid(`"${key}" is required.`);
  return value;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean {
  const value = args[key];
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw invalid(`"${key}" must be true or false.`);
  return value;
}

const SESSION_PROPERTY = { type: 'string', description: 'The session\'s directory name, as session_start or session_list gave it.' } as const;

// ---- session_start --------------------------------------------------------------

export const SESSION_START_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'A short name for what the session is for, e.g. "kestrel-launch"; it becomes part of the branch and directory name. Optional.' },
  },
} as const;

export interface SessionStartResult {
  session: string;
  root: string;
  branch: string;
  label: string | null;
  message: string;
}

/** Under the write mutex. */
export async function sessionStartTool(write: WriteDeps, email: string, args: Record<string, unknown>): Promise<SessionStartResult> {
  const label = optionalString(args, 'label');
  const open = (await memberSessions(write, email)).filter((s) => s.kind === 'session');
  if (open.length >= MAX_OPEN_SESSIONS) {
    throw new ToolRefusal(
      'mcp.session_limit',
      `You already hold ${open.length} open sessions, the most one member may. Submit or discard one first: ${open.map((s) => s.name).join(', ')}.`,
      { sessions: open.map((s) => ({ session: s.name, root: s.root })) },
    );
  }
  let started;
  try {
    started = await startSession(write, label);
  } catch (err) {
    // The core names the existing worktree's server path; over MCP the label is enough, and the member's own session is named by its root.
    if (err instanceof ContextureError && err.finding.code === 'session.name_exists') {
      const mine = open.find((s) => sessionLabelFromDirName(write.config, s.name) === err.finding.subject);
      throw new ToolRefusal(
        'session.name_exists',
        mine === undefined
          ? `A session labelled "${err.finding.subject}" already exists; start this one under another label.`
          : `You already have a session labelled "${err.finding.subject}": ${mine.name}, root ${mine.root}. Work there, or start this one under another label.`,
        mine === undefined ? {} : { session: mine.name, root: mine.root },
      );
    }
    throw err;
  }
  await ownershipOf(write).record(started.name, { owner: email, kind: 'session', started_at: write.now().toISOString() });
  const root = await sessionRootFor(write, started.name);
  return {
    session: started.name,
    root,
    branch: started.branch,
    label: started.label,
    message: `Started session ${started.name}. Address its files under ${root} (for example ${root}<path>); nothing is published until session_submit.`,
  };
}

// ---- session_list ---------------------------------------------------------------

export const SESSION_LIST_INPUT_SCHEMA = { type: 'object', properties: {} } as const;

export interface SessionRow {
  session: string;
  root: string;
  branch: string;
  label: string | null;
  /** `capture` for a session the capture tool opened, which the session cap does not count. */
  kind: 'session' | 'capture';
  started_at: string | null;
  uncommitted: boolean;
  ahead: number;
  pull_request: { number: number | null; state: 'open' | 'unknown'; url: string | null } | null;
  /** With change approval declared: the decision `ctxr review list` reports for the open pull request. */
  review: { state: string; comment: string | null } | null;
}

export async function sessionListTool(write: WriteDeps, email: string): Promise<{ sessions: SessionRow[]; forge_reachable: boolean; limit: number }> {
  const mine = new Map((await memberSessions(write, email)).map((s) => [s.name, s]));
  const listed = await listSessions(write.git, write.canonicalRoot, write.config, {
    review: { forge: write.forge, recordingLogin: write.config.change_approval?.recording_login ?? null },
  });
  const rows: SessionRow[] = [];
  for (const entry of listed.sessions) {
    const session = mine.get(entry.name);
    if (session === undefined) continue;
    rows.push({
      session: entry.name,
      root: session.root,
      branch: entry.branch,
      label: sessionLabelFromDirName(write.config, entry.name),
      kind: session.kind,
      started_at: session.started_at,
      uncommitted: entry.uncommitted,
      ahead: entry.ahead,
      pull_request: entry.pull_request ?? null,
      review: entry.review ?? null,
    });
  }
  return { sessions: rows, forge_reachable: listed.forge_reachable !== false, limit: MAX_OPEN_SESSIONS };
}

// ---- session_status -------------------------------------------------------------

export const SESSION_STATUS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    session: SESSION_PROPERTY,
    diff: { type: 'boolean', description: `Also return the unified diff of uncommitted work, up to ${STATUS_DIFF_MAX_BYTES / 1024} KB.` },
  },
  required: ['session'],
} as const;

/** A path relative to the worktree's top level, as the tools address it: under the session root. */
async function shownPath(write: WriteDeps, session: MemberSession, topRelative: string): Promise<string> {
  const prefix = await repoPrefixOf(write);
  return `${session.root}${topRelative.startsWith(prefix) ? topRelative.slice(prefix.length) : topRelative}`;
}

export async function sessionStatusTool(write: WriteDeps, email: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await ownedSession(write, email, args.session);
  const status = await sessionStatus({ git: write.git, config: write.config, env: write.env, credentials: write.credentials }, session.ref, { diff: optionalBoolean(args, 'diff') });
  let diff = status.diff;
  let truncated = false;
  if (diff !== null && Buffer.byteLength(diff, 'utf8') > STATUS_DIFF_MAX_BYTES) {
    diff = Buffer.from(diff, 'utf8').subarray(0, STATUS_DIFF_MAX_BYTES).toString('utf8');
    truncated = true;
  }
  const { worktree: _worktree, ...rest } = status;
  return {
    ...rest,
    root: session.root,
    uncommitted: await Promise.all(status.uncommitted.map(async (c) => ({ status: c.status, path: await shownPath(write, session, c.path) }))),
    diff,
    diff_truncated: truncated,
  };
}

// ---- session_submit -------------------------------------------------------------

export const SESSION_SUBMIT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    session: SESSION_PROPERTY,
    branch: { type: 'string', description: 'The branch name the pull request carries, e.g. "notes/kestrel-intro"; the session\'s branch is renamed to it.' },
    message: { type: 'string', description: 'The commit message: a subject line, a blank line, then what changed and why.' },
    title: { type: 'string', description: 'The pull request title.' },
    body: { type: 'string', description: 'The pull request body: why, what changed, route, verification and follow-ups. The Pages and Knowledge changes sections are appended for you; leave them out.' },
  },
  required: ['session', 'branch', 'message', 'title', 'body'],
} as const;

/** Under the write mutex. */
export async function sessionSubmitTool(write: WriteDeps, email: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input = { branch: requiredString(args, 'branch'), message: requiredString(args, 'message'), title: requiredString(args, 'title'), body: requiredString(args, 'body') };
  const session = await ownedSession(write, email, args.session);
  if (await rebaseInProgress(write.git, session.ref.path)) {
    throw new ToolRefusal(
      'mcp.rebase_in_progress',
      `A rebase is in progress in ${session.name}, so it cannot be submitted. Resolve the conflicts with Edit and call session_rebase with continue: true, or undo the rebase with abort: true.`,
      { session: session.name },
    );
  }
  const submitted = await submitSession({ ...write, commit: memberCommit(write, email, 'Edited-by') }, session.ref, input);
  const approval = write.config.change_approval === undefined ? null : approvalUrl(write, session.name);
  const { worktree: _worktree, ...rest } = submitted;
  return {
    ...rest,
    root: session.root,
    approval_url: approval,
    message:
      `Submitted ${session.name} as pull request #${submitted.pull_request.number} (${submitted.steps.pull_request}).` +
      (approval === null ? '' : ` It lands once someone approves it at ${approval}; share that address with whoever decides.`),
  };
}

// ---- session_rebase -------------------------------------------------------------

export const SESSION_REBASE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    session: SESSION_PROPERTY,
    continue: { type: 'boolean', description: 'Stage the resolved files and continue the rebase in progress.' },
    abort: { type: 'boolean', description: 'Abort the rebase in progress and restore the session as it was.' },
  },
  required: ['session'],
} as const;

/** Under the write mutex. A conflict is a result, not a refusal: the conflicting files are returned with both sides. */
export async function sessionRebaseTool(write: WriteDeps, email: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const doContinue = optionalBoolean(args, 'continue');
  const doAbort = optionalBoolean(args, 'abort');
  if (doContinue && doAbort) throw invalid('Pass continue or abort, not both.');
  const session = await ownedSession(write, email, args.session);
  const mode: RebaseMode = doContinue ? 'continue' : doAbort ? 'abort' : 'start';
  const result = await rebaseSession({ git: write.git, config: write.config, env: write.env, credentials: write.credentials }, session.ref, mode);
  const conflicts = await Promise.all(result.conflicts.map(async (c) => ({ ...c, path: await shownPath(write, session, c.path) })));
  const message =
    result.outcome === 'conflict'
      ? `The rebase stopped on ${conflicts.length} conflicting file(s): ${conflicts.map((c) => c.path).join(', ')}. Edit each to keep both sides' meaning, removing the conflict markers, then call session_rebase with continue: true.`
      : result.outcome === 'aborted'
        ? `The rebase was aborted; ${session.name} is as it was.`
        : result.outcome === 'up-to-date'
          ? `${session.name} is already on ${result.onto}.`
          : `${session.name} is rebased onto ${result.onto}. Submitting it again pushes the rewritten branch with a lease.`;
  return { ...result, root: session.root, conflicts, message };
}

// ---- session_discard ------------------------------------------------------------

export const SESSION_DISCARD_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    session: SESSION_PROPERTY,
    force: { type: 'boolean', description: 'Discard uncommitted changes and commits the remote branch lacks. Without it, a session holding unpublished work is refused.' },
    close_pull_request: { type: 'boolean', description: "Also close the session's open pull request." },
  },
  required: ['session'],
} as const;

/** Under the write mutex. Destructive. */
export async function sessionDiscardTool(write: WriteDeps, email: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const force = optionalBoolean(args, 'force');
  const closePullRequest = optionalBoolean(args, 'close_pull_request');
  const session = await ownedSession(write, email, args.session);
  const result = await discardSession({ git: write.git, config: write.config, credentials: write.credentials, forge: write.forge, env: write.env }, session.ref, { force, closePullRequest });
  await ownershipOf(write).forget(session.name);
  const { worktree: _worktree, ...rest } = result;
  const closed = result.closed_pull_request === null ? '' : ` Pull request #${result.closed_pull_request} is closed.`;
  return { ...rest, message: `Discarded ${session.name} and its branch ${result.branch}.${closed}` };
}
