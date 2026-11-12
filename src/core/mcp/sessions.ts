import type { StoreConfig } from '../../config/schema.js';
import { ContextureError } from '../errors.js';
import { runRemoteGit, type ForgeCredentials } from '../forge/credentials.js';
import type { ForgeClient } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import type { CommitOptions } from '../session/commit.js';
import { fetchDefaultBranch } from '../session/status.js';
import { startSession as startCoreSession, type StartedSession } from '../session/start.js';
import { ToolRefusal } from './jsonrpc.js';

/**
 * serve-the-store-over-mcp design.md D9, D13: the write side the MCP surface
 * shares between its tools. Everything it writes is an ordinary session — a
 * worktree under the configured worktrees path, on a branch under the session
 * prefix, with a pull request — so the approval page lists it and `ctxr land`
 * lands it with no MCP-specific path anywhere.
 *
 * serve-the-session-lifecycle-to-chat-apps D3: starting, submitting,
 * rebasing and discarding are `src/core/session/`'s, the same calls
 * `ctxr session <verb>` makes. What stays here is what the MCP layer adds:
 * the server's forge credential on every remote step, the member as commit
 * author, and the surface's wording of a refusal. The per-member draft's
 * helpers are gone with the draft.
 */

export interface WriteDeps {
  git: GitRunner;
  /** The store root `serve` was started on: where sessions are started, as `ctxr session start` starts them. */
  canonicalRoot: string;
  config: StoreConfig;
  credentials: ForgeCredentials;
  forge: ForgeClient;
  env: Readonly<Record<string, string | undefined>>;
  now(): Date;
  /** `change_approval.recording_login`: the committer when the host has no git identity, as `ctxr land` does. */
  recordingLogin: string;
  /** `serve.base_url`, for the approval page address a tool returns. */
  baseUrl: string;
  /** The store root's path inside its repository, when the caller has already resolved it; asked of git otherwise. */
  repoPrefix?: string;
}

export class WriteRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WriteRefusal';
  }
}

/** One write at a time across every tool that changes a worktree, the ownership record or the forge (design.md D9, D13). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** The approval page for a session, at the server's own address. */
export function approvalUrl(deps: WriteDeps, sessionName: string): string {
  return `${deps.baseUrl.replace(/\/+$/, '')}/approve/${encodeURIComponent(sessionName)}`;
}

async function branchTaken(deps: WriteDeps, branch: string): Promise<boolean> {
  const local = await deps.git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: deps.canonicalRoot, allowFailure: true });
  if (local.exitCode === 0) return true;
  const remote = await runRemoteGit(deps.git, deps.credentials, deps.env, ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], { cwd: deps.canonicalRoot, allowFailure: true });
  return remote.exitCode === 0;
}

/**
 * A new session from the freshly fetched default branch, through the core
 * `ctxr session start` calls. A closed pull request's branch stays on the
 * remote, so a generated name the remote already carries is stepped past.
 */
export async function startSession(deps: WriteDeps, label: string | undefined): Promise<StartedSession> {
  return startCoreSession(
    {
      git: deps.git,
      config: deps.config,
      fetch: (cwd) => fetchDefaultBranch({ git: deps.git, config: deps.config, env: deps.env, credentials: deps.credentials }, cwd),
      now: deps.now,
      branchTaken: (branch) => branchTaken(deps, branch),
    },
    deps.canonicalRoot,
    label,
  );
}

/** D3: the member as the commit's author, with a trailer naming them; the recording login commits when the host has no identity. */
export function memberCommit(deps: WriteDeps, email: string, trailer: string): Omit<CommitOptions, 'message'> {
  return { author: { name: email.split('@')[0] ?? email, email }, trailer: { key: trailer, value: email }, fallbackCommitter: deps.recordingLogin };
}

/** A WriteRefusal or a core refusal, as a refusal the client model can read rather than a protocol error. */
export function asToolRefusal(err: unknown): unknown {
  if (err instanceof WriteRefusal) return new ToolRefusal(err.code, err.message, err.details);
  if (err instanceof ContextureError) return new ToolRefusal(err.finding.code, err.finding.message, err.finding.details);
  return err;
}
