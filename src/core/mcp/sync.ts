import { existsSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { MIGRATION_STEPS } from '../../config/migrations.js';
import type { StoreConfig } from '../../config/schema.js';
import { sessionWorktrees } from '../approval/sessions.js';
import type { ForgeCredentials } from '../forge/credentials.js';
import { runRemoteGit } from '../forge/credentials.js';
import type { ForgeClient } from '../forge/github.js';
import { isUnderAnyPrefix } from '../fs/prefix.js';
import type { GitRunner } from '../git/exec.js';
import { pruneWorktrees } from '../git/worktree.js';
import { renderGraphDocument } from '../graph/document.js';
import { buildGraphFromNotes, graphBuildOptions } from '../graph/model.js';
import { readGraph, writeGraph, writeGraphDocument } from '../graph/persist.js';
import { listNotes } from '../notes/list.js';
import type { Store } from '../store.js';
import { ToolRefusal } from './jsonrpc.js';
import { ReadWriteLock } from './rwlock.js';

/**
 * serve-the-store-over-mcp design.md D6 (remote-access spec, *The surface
 * reads from a checkout of its own*): the canonical checkout `serve` was
 * started on is shared with the agents and moved by `ctxr land`, so the MCP
 * surface never changes it. It reads from a detached worktree of its own
 * under the derived cache path, which it moves by forced checkout to the
 * remote default branch at most once per interval, with its own graph. A
 * reader-writer lock keeps every tool call on one commit; a sync that cannot
 * finish restores the view and its graph together, or refuses calls until a
 * sync works.
 */

export const DEFAULT_SYNC_INTERVAL_SECONDS = 60;

/** An inbox file added by a session branch that has an open pull request — a capture awaiting a decision. */
export interface PendingCapture {
  branch: string;
  /** Store-relative. */
  path: string;
  text: string;
}

export interface StoreState {
  head: string;
  sync_error: string | null;
}

export interface Snapshot {
  head: string;
  /** The view as a store: its own root, and the configuration committed at `head`. */
  store: Store;
  pending: readonly PendingCapture[];
}

/** What a sync needs from the server's current state — re-read per request, so configuration reloads apply. */
export interface SyncDeps {
  /** The configuration `serve` loaded for the canonical checkout (session prefix, default branch). */
  config: StoreConfig;
  credentials: ForgeCredentials;
  forge: ForgeClient;
  env: Readonly<Record<string, string | undefined>>;
}

export interface ViewOptions {
  git: GitRunner;
  /** The store root `serve` was started on. */
  canonicalRoot: string;
  intervalSeconds?: number;
  now(): Date;
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

/** Where the view's worktree lives: under the canonical checkout's derived cache, beside the graph. */
export function viewWorktreeDir(canonicalRoot: string): string {
  return path.join(canonicalRoot, '.contexture', 'cache', 'mcp', 'view');
}

export class McpView {
  private readonly lock = new ReadWriteLock();
  private readonly intervalMs: number;
  private head = '';
  private lastError: string | null = null;
  private unavailable = false;
  private lastSyncAt: number | undefined;
  private syncing: Promise<void> | undefined;
  private pending: PendingCapture[] = [];
  private viewStore: Store | undefined;
  /** The canonical store root's path inside its repository ("" at the top level, else "sub/dir/"). */
  private repoPrefix: string | undefined;

  constructor(private readonly options: ViewOptions) {
    this.intervalMs = (options.intervalSeconds ?? DEFAULT_SYNC_INTERVAL_SECONDS) * 1000;
  }

  private run(args: readonly string[], cwd: string) {
    return this.options.git.run(args, { cwd, allowFailure: true });
  }

  get state(): StoreState {
    return { head: this.head, sync_error: this.lastError };
  }

  /** Runs `fn` against one commit, after a sync if one is due, and stamps the result with what it read. */
  async read<T extends object>(deps: SyncDeps, fn: (snapshot: Snapshot) => Promise<T>): Promise<T & { store: StoreState }> {
    await this.maybeSync(deps, false);
    return this.lock.read(async () => {
      if (this.unavailable || this.viewStore === undefined) {
        throw new ToolRefusal('mcp.store_unavailable', `The store cannot be read until a sync succeeds: ${this.lastError ?? 'it has not been read yet'}.`);
      }
      const result = await fn({ head: this.head, store: this.viewStore, pending: this.pending });
      return { ...result, store: this.state };
    });
  }

  /** For `capture`: a sync forced now, so the duplicate check sees what was pushed and opened a moment ago (design.md D9). */
  async refresh(deps: SyncDeps): Promise<void> {
    await this.maybeSync(deps, true);
  }

  private async maybeSync(deps: SyncDeps, force: boolean): Promise<void> {
    const now = this.options.now().getTime();
    const due = force || this.lastSyncAt === undefined || now - this.lastSyncAt >= this.intervalMs;
    if (!due) return;
    this.syncing ??= this.lock.write(() => this.syncOnce(deps)).finally(() => {
      this.syncing = undefined;
    });
    await this.syncing;
  }

  private async ensureView(startRef: string): Promise<string> {
    const canonical = this.options.canonicalRoot;
    this.repoPrefix ??= (await this.run(['rev-parse', '--show-prefix'], canonical)).stdout.trim();
    const dir = viewWorktreeDir(canonical);
    if (!existsSync(path.join(dir, '.git'))) {
      // A view deleted with the derived cache leaves a registration behind; clear it before adding another.
      await pruneWorktrees(this.options.git, canonical);
      const added = await this.run(['worktree', 'add', '--detach', '--force', dir, startRef], canonical);
      if (added.exitCode !== 0) throw new Error(`could not create the read view: ${firstLine(added.stderr)}`);
    }
    return path.join(dir, this.repoPrefix);
  }

  /** Exclusive: no tool call is reading while this runs. */
  private async syncOnce(deps: SyncDeps): Promise<void> {
    this.lastSyncAt = this.options.now().getTime();
    const canonical = this.options.canonicalRoot;
    const branch = deps.config.git.default_branch;
    const remoteRef = `refs/remotes/origin/${branch}`;

    const fetched = await runRemoteGit(this.options.git, deps.credentials, deps.env, ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:${remoteRef}`], {
      cwd: canonical,
      allowFailure: true,
    });
    const fetchError = fetched.exitCode === 0 ? null : `fetch failed: ${firstLine(fetched.stderr) || `exit ${fetched.exitCode}`}`;
    const hasRemoteRef = (await this.run(['rev-parse', '--verify', '--quiet', `${remoteRef}^{commit}`], canonical)).exitCode === 0;
    const target = hasRemoteRef ? remoteRef : branch;

    let viewRoot: string;
    try {
      viewRoot = await this.ensureView(target);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.unavailable = this.viewStore === undefined;
      return;
    }

    const previous = this.head;
    const moved = await this.checkout(viewRoot, target);
    if (moved !== null) {
      this.lastError = moved;
      this.unavailable = this.viewStore === undefined;
      return;
    }
    const next = (await this.run(['rev-parse', 'HEAD'], viewRoot)).stdout.trim();

    if (next !== previous || this.viewStore === undefined || (await readGraph(this.viewStore)) === null) {
      try {
        this.viewStore = await this.rebuild(viewRoot);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const restored = previous === '' ? 'nothing to restore' : await this.restore(viewRoot, previous);
        if (restored === null) {
          this.lastError = `the read view could not be built at ${next.slice(0, 12)} (${reason}); serving ${previous.slice(0, 12)}`;
          this.unavailable = false;
        } else {
          this.lastError = `the read view could not be built at ${next.slice(0, 12)} (${reason}), and restoring the previous commit failed (${restored})`;
          this.unavailable = true;
        }
        await this.readPending(deps);
        return;
      }
    }

    this.head = next;
    this.unavailable = false;
    const pendingError = await this.readPending(deps);
    this.lastError = fetchError ?? pendingError;
  }

  /** Forced, detached, and cleaned of untracked files — the view is this surface's alone. Null on success. */
  private async checkout(viewRoot: string, ref: string): Promise<string | null> {
    const checkedOut = await this.run(['checkout', '--quiet', '--detach', '--force', ref], viewRoot);
    if (checkedOut.exitCode !== 0) return `the read view could not check out ${ref}: ${firstLine(checkedOut.stderr)}`;
    await this.run(['clean', '-fdq'], viewRoot);
    return null;
  }

  /** The configuration committed at the view's commit, and that commit's graph. */
  private async rebuild(viewRoot: string): Promise<Store> {
    const config = await readConfig(viewRoot, MIGRATION_STEPS);
    const store: Store = { root: viewRoot, config };
    const notes = await listNotes(store.root, store.config);
    const graph = buildGraphFromNotes(notes, graphBuildOptions(store.config));
    await writeGraph(store, graph);
    await writeGraphDocument(store, renderGraphDocument(graph, store.config.retrieval.graph).text);
    return store;
  }

  /** Back to `commit` with its graph; null on success, else why not. */
  private async restore(viewRoot: string, commit: string): Promise<string | null> {
    const failed = await this.checkout(viewRoot, commit);
    if (failed !== null) return failed;
    try {
      this.viewStore = await this.rebuild(viewRoot);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * design.md D6–D7: "pending" means what the approval index means by it — a
   * session branch with an open pull request. Returns an error line when the
   * forge could not be read, keeping the previous list.
   */
  private async readPending(deps: SyncDeps): Promise<string | null> {
    let open: Set<string>;
    try {
      open = new Set((await deps.forge.openPulls()).map((p) => p.headRef));
    } catch (err) {
      return `open pull requests could not be read: ${err instanceof Error ? firstLine(err.message) : String(err)}`;
    }
    const canonical = this.options.canonicalRoot;
    const prefix = this.repoPrefix ?? '';
    const inbox = deps.config.ingest.inbox_path;
    const base = `refs/remotes/origin/${deps.config.git.default_branch}`;
    const found: PendingCapture[] = [];
    const sessions = (await sessionWorktrees(this.options.git, canonical, deps.config)).filter((s) => open.has(s.branch));
    for (const session of sessions.sort((a, b) => (a.branch < b.branch ? -1 : 1))) {
      const added = await this.run(['diff', '--name-only', '--diff-filter=A', '--no-renames', `${base}...${session.branch}`], canonical);
      if (added.exitCode !== 0) continue;
      for (const repoPath of added.stdout.split('\n').filter((p) => p.length > 0)) {
        if (!repoPath.startsWith(prefix)) continue;
        const filePath = repoPath.slice(prefix.length);
        if (!filePath.endsWith('.md') || !isUnderAnyPrefix(filePath, [inbox])) continue;
        const shown = await this.run(['show', `${session.branch}:${repoPath}`], canonical);
        if (shown.exitCode === 0) found.push({ branch: session.branch, path: filePath, text: shown.stdout });
      }
    }
    this.pending = found;
    return null;
  }
}
