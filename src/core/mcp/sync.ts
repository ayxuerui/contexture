import { ContextureError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { isUnderAnyPrefix } from '../fs/prefix.js';
import type { GitRunner } from '../git/exec.js';
import { renderGraphDocument } from '../graph/document.js';
import { buildGraphFromNotes, graphBuildOptions } from '../graph/model.js';
import { readGraph, writeGraph, writeGraphDocument } from '../graph/persist.js';
import { listNotes } from '../notes/list.js';
import type { Store } from '../store.js';
import { ToolRefusal } from './jsonrpc.js';
import { ReadWriteLock } from './rwlock.js';

/**
 * serve-the-store-over-mcp design.md D8: the server's checkout follows the
 * remote default branch by fast-forward only, at most once per interval, and
 * every tool call reads one commit under a shared lock. A sync that cannot
 * finish leaves the checkout and its graph together at the last good commit,
 * or — when even that cannot be restored — refuses calls until a sync works.
 */

export const REMOTE = 'origin';
/** Matches the branch prefix `capture` pushes to and `check-branch` gates (design.md D5). */
export const CAPTURE_BRANCH_PREFIX = 'capture/';

/** An inbox file waiting on a `capture/` branch whose tip the default branch does not yet contain. */
export interface PendingCapture {
  branch: string;
  path: string;
  text: string;
}

export interface StoreState {
  head: string;
  sync_error: string | null;
}

export interface Snapshot {
  head: string;
  pending: readonly PendingCapture[];
}

export interface SyncOptions {
  /** Seconds between syncs; 0 never fetches. */
  pullIntervalSeconds: number;
  now(): Date;
}

function syncError(code: string, message: string, details?: Record<string, unknown>): ContextureError {
  return new ContextureError(ExitCode.Usage, { code, severity: 'error', message, ...(details ? { details } : {}) });
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

export class StoreSync {
  private readonly lock = new ReadWriteLock();
  private head = '';
  private lastError: string | null = null;
  private unavailable = false;
  private lastSyncAt: number | undefined;
  private syncing: Promise<void> | undefined;
  private pending: PendingCapture[] = [];
  /** The store root's path inside the repository ("" at the top level, else "sub/dir/") — git reports repository-relative paths. */
  private repoPrefix = '';

  constructor(
    private readonly git: GitRunner,
    private readonly store: Store,
    private readonly options: SyncOptions,
  ) {}

  private run(args: readonly string[]) {
    return this.git.run(args, { cwd: this.store.root, allowFailure: true });
  }

  private get defaultBranch(): string {
    return this.store.config.git.default_branch;
  }

  /** remote-access spec: refuses unless the root is a clean checkout of the default branch. */
  async start(): Promise<void> {
    const branch = await this.run(['symbolic-ref', '--short', 'HEAD']);
    if (branch.exitCode !== 0 || branch.stdout.trim() !== this.defaultBranch) {
      throw syncError(
        'mcp.not_on_default_branch',
        `The MCP server serves a checkout of the default branch "${this.defaultBranch}", but "${this.store.root}" is on ${branch.exitCode === 0 ? `"${branch.stdout.trim()}"` : 'a detached HEAD'}. Use a dedicated clone.`,
      );
    }

    this.repoPrefix = (await this.run(['rev-parse', '--show-prefix'])).stdout.trim();
    const status = await this.run(['status', '--porcelain=v1', '--untracked-files=all']);
    const dirty = status.stdout
      .split('\n')
      .filter((line) => line.length > 3)
      .map((line) => line.slice(3).replace(/^"|"$/g, ''))
      .map((p) => (p.startsWith(this.repoPrefix) ? p.slice(this.repoPrefix.length) : p))
      .filter((p) => !isUnderAnyPrefix(p, this.store.config.derived.paths));
    if (dirty.length > 0) {
      throw syncError(
        'mcp.checkout_dirty',
        `The MCP server's checkout must have no uncommitted change, but ${dirty.length} path(s) differ: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', …' : ''}.`,
        { paths: dirty },
      );
    }

    if (this.options.pullIntervalSeconds > 0) {
      const remote = await this.run(['remote', 'get-url', REMOTE]);
      if (remote.exitCode !== 0) {
        throw syncError('mcp.no_remote', `The checkout has no "${REMOTE}" remote to follow; add one, or pass --pull-interval 0 to serve it as it stands.`);
      }
    }

    this.head = (await this.run(['rev-parse', 'HEAD'])).stdout.trim();
    if ((await readGraph(this.store)) === null) await this.rebuildGraph();
    this.pending = await this.readPending();
    if (this.options.pullIntervalSeconds > 0) await this.lock.write(() => this.syncOnce());
  }

  get state(): StoreState {
    return { head: this.head, sync_error: this.lastError };
  }

  /** Runs `fn` against one commit, after a sync if one is due, and stamps the result with what it read. */
  async read<T extends object>(fn: (snapshot: Snapshot) => Promise<T>): Promise<T & { store: StoreState }> {
    await this.maybeSync();
    return this.lock.read(async () => {
      if (this.unavailable) {
        throw new ToolRefusal('mcp.store_unavailable', `The store is unavailable until a sync succeeds: ${this.lastError ?? 'the last sync failed'}.`);
      }
      const result = await fn({ head: this.head, pending: this.pending });
      return { ...result, store: this.state };
    });
  }

  /** For `capture`: a sync forced now, so the duplicate check sees branches pushed a moment ago (design.md D5). */
  async refresh(): Promise<void> {
    this.lastSyncAt = undefined;
    await this.maybeSync(true);
  }

  private async maybeSync(force = false): Promise<void> {
    if (this.options.pullIntervalSeconds <= 0 && !force) return;
    const now = this.options.now().getTime();
    if (!force && this.lastSyncAt !== undefined && now - this.lastSyncAt < this.options.pullIntervalSeconds * 1000) return;
    this.syncing ??= this.lock.write(() => this.syncOnce()).finally(() => {
      this.syncing = undefined;
    });
    await this.syncing;
  }

  /** Exclusive: no tool call is reading while this runs. */
  private async syncOnce(): Promise<void> {
    this.lastSyncAt = this.options.now().getTime();
    const fetch = await this.run([
      'fetch',
      '--prune',
      '--quiet',
      REMOTE,
      `+refs/heads/${this.defaultBranch}:refs/remotes/${REMOTE}/${this.defaultBranch}`,
      `+refs/heads/${CAPTURE_BRANCH_PREFIX}*:refs/remotes/${REMOTE}/${CAPTURE_BRANCH_PREFIX}*`,
    ]);
    if (fetch.exitCode !== 0) {
      this.lastError = `fetch failed: ${firstLine(fetch.stderr) || `exit ${fetch.exitCode}`}`;
      return;
    }

    const previous = this.head;
    const merge = await this.run(['merge', '--ff-only', '--quiet', `${REMOTE}/${this.defaultBranch}`]);
    if (merge.exitCode !== 0) {
      this.lastError = `fast-forward failed: ${firstLine(merge.stderr) || `exit ${merge.exitCode}`}`;
      return;
    }
    const next = (await this.run(['rev-parse', 'HEAD'])).stdout.trim();

    if (next !== previous || (await readGraph(this.store)) === null) {
      try {
        await this.rebuildGraph();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const reset = await this.run(['reset', '--hard', '--quiet', previous]);
        try {
          if (reset.exitCode !== 0) throw new Error(firstLine(reset.stderr));
          await this.rebuildGraph();
          this.head = previous;
          this.lastError = `graph rebuild failed at ${next.slice(0, 12)} (${reason}); serving ${previous.slice(0, 12)}`;
          this.unavailable = false;
        } catch {
          this.unavailable = true;
          this.lastError = `graph rebuild failed at ${next.slice(0, 12)} (${reason}), and restoring ${previous.slice(0, 12)} failed too`;
        }
        this.pending = await this.readPending();
        return;
      }
    }

    this.head = next;
    this.pending = await this.readPending();
    this.lastError = null;
    this.unavailable = false;
  }

  private async rebuildGraph(): Promise<void> {
    const notes = await listNotes(this.store.root, this.store.config);
    const graph = buildGraphFromNotes(notes, graphBuildOptions(this.store.config));
    await writeGraph(this.store, graph);
    await writeGraphDocument(this.store, renderGraphDocument(graph, this.store.config.retrieval.graph).text);
  }

  /** remote-access spec: a `capture/` branch is pending only while its tip is not an ancestor of the default branch. */
  private async readPending(): Promise<PendingCapture[]> {
    const refs = await this.run(['for-each-ref', '--format=%(refname)', `refs/remotes/${REMOTE}/${CAPTURE_BRANCH_PREFIX}`]);
    const inbox = this.store.config.ingest.inbox_path;
    const found: PendingCapture[] = [];
    for (const ref of refs.stdout.split('\n').filter((r) => r.length > 0).sort()) {
      if ((await this.run(['merge-base', '--is-ancestor', ref, 'HEAD'])).exitCode === 0) continue;
      const added = await this.run(['diff', '--name-only', '--diff-filter=A', '--no-renames', `HEAD...${ref}`]);
      if (added.exitCode !== 0) continue;
      for (const repoPath of added.stdout.split('\n').filter((p) => p.length > 0)) {
        if (!repoPath.startsWith(this.repoPrefix)) continue;
        const filePath = repoPath.slice(this.repoPrefix.length);
        if (!filePath.endsWith('.md') || !isUnderAnyPrefix(filePath, [inbox])) continue;
        const shown = await this.run(['show', `${ref}:${repoPath}`]);
        if (shown.exitCode !== 0) continue;
        found.push({ branch: ref.slice(`refs/remotes/${REMOTE}/`.length), path: filePath, text: shown.stdout });
      }
    }
    return found;
  }
}
