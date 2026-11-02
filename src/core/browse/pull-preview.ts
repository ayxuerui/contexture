import { readBlobBytes, type GitRunner } from '../git/exec.js';
import { runRemoteGit, type ForgeCredentials } from '../forge/credentials.js';
import { ForgeRequestError, type ForgeClient, type PullRequest } from '../forge/github.js';
import { storePrefix } from '../graph/tree.js';
import type { Store } from '../store.js';
import { joinBaseUrl, publishRoute } from './page-url.js';

/**
 * context-browsing spec ("A pull request's pages are previewable from its
 * pushed branch"; "A pull request preview is fetched when it is opened"; "A
 * merged pull request's preview points to the published page"),
 * serve-keeps-its-clone-current D6: a pull request's published pages, read
 * from its head commit on the forge, at the address of the store that will
 * publish them — whichever container wrote them.
 *
 * The head is asked of the forge and reused for at most `HEAD_REUSE_MS`; a
 * commit the clone lacks is fetched into `refs/ctxr-preview/pull/<number>`, a
 * namespace of this server's own, so the clone's branches and working tree are
 * never touched. Only files under the configured publish path at that commit
 * are addressable: an exact-key lookup in that listing, as for `/publish/`, so
 * a miss is the traversal guard and notes are never served.
 */
export const HEAD_REUSE_MS = 15 * 1000;

export type PullPreviewAnswer =
  | { kind: 'file'; filePath: string; body: Buffer }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' }
  | { kind: 'unavailable'; message: string };

export interface PullPreviewDeps {
  /** A hardened runner: these fetches run in the clone the agent shares, next to the forge credential. */
  git: GitRunner;
  env: Readonly<Record<string, string | undefined>>;
  now(): Date;
  /** The forge client and credential for the store; rejects when no credential can be formed. */
  forgeFor(store: Store): Promise<{ forge: ForgeClient; credentials: ForgeCredentials }>;
}

const PREVIEW_REF_PREFIX = 'refs/ctxr-preview/pull/';

/** Bounded so a long-running server does not keep every commit's listing it ever answered. */
const MAX_LISTINGS = 64;

export class PullPreviews {
  private readonly heads = new Map<string, { pull: PullRequest; readAt: number }>();
  private readonly listings = new Map<string, Map<string, string>>();

  constructor(private readonly deps: PullPreviewDeps) {}

  /** The answer for `filePath` (under the publish path) of pull request `number`. */
  async answer(store: Store, number: number, filePath: string): Promise<PullPreviewAnswer> {
    let pull: PullRequest | null;
    try {
      pull = await this.head(store, number);
    } catch (err) {
      return { kind: 'unavailable', message: `the forge could not be read: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (pull === null) return { kind: 'not-found' };
    if (pull.merged) {
      const route = publishRoute(filePath);
      return { kind: 'redirect', location: joinBaseUrl(store.config.serve?.base_url, route) ?? route };
    }
    if (pull.state !== 'open') return { kind: 'not-found' };

    const present = await this.ensureCommit(store, pull);
    if (!present) return { kind: 'unavailable', message: `the pull request's head ${pull.headSha} could not be fetched` };
    const object = (await this.listing(store, pull.headSha)).get(filePath);
    if (object === undefined) return { kind: 'not-found' };
    const leading = (await this.deps.git.leadingArgs?.(store.root)) ?? [];
    return { kind: 'file', filePath, body: await readBlobBytes(store.root, object, leading) };
  }

  /**
   * A verified push to `branch`: each open pull request whose head it is gets
   * its head read again and fetched now, so its preview is ready before it is
   * opened. The branch name is the only thing taken from the delivery.
   */
  async prefetchBranch(store: Store, branch: string): Promise<number[]> {
    const { forge } = await this.deps.forgeFor(store);
    const fetched: number[] = [];
    for (const pull of await forge.pullsForHead(branch)) {
      if (pull.state !== 'open' || pull.merged) continue;
      this.heads.set(this.key(store, pull.number), { pull, readAt: this.deps.now().getTime() });
      if (await this.ensureCommit(store, pull)) fetched.push(pull.number);
    }
    return fetched;
  }

  private key(store: Store, number: number): string {
    return `${store.root}\0${number}`;
  }

  /** The pull request as the forge reports it, reused for at most HEAD_REUSE_MS; null when the forge does not know it. */
  private async head(store: Store, number: number): Promise<PullRequest | null> {
    const key = this.key(store, number);
    const now = this.deps.now().getTime();
    const cached = this.heads.get(key);
    if (cached !== undefined && now - cached.readAt <= HEAD_REUSE_MS) return cached.pull;
    const { forge } = await this.deps.forgeFor(store);
    let pull: PullRequest;
    try {
      pull = await forge.pull(number);
    } catch (err) {
      if (err instanceof ForgeRequestError && err.status === 404) {
        this.heads.delete(key);
        return null;
      }
      throw err;
    }
    this.heads.set(key, { pull, readAt: now });
    return pull;
  }

  private async hasCommit(store: Store, sha: string): Promise<boolean> {
    const r = await this.deps.git.run(['cat-file', '-e', `${sha}^{commit}`], { cwd: store.root, allowFailure: true });
    return r.exitCode === 0;
  }

  /** The head commit in the clone, fetched into this server's own ref namespace when it is missing. */
  private async ensureCommit(store: Store, pull: PullRequest): Promise<boolean> {
    if (await this.hasCommit(store, pull.headSha)) return true;
    let credentials: ForgeCredentials;
    try {
      credentials = (await this.deps.forgeFor(store)).credentials;
    } catch {
      return false;
    }
    const ref = `${PREVIEW_REF_PREFIX}${pull.number}`;
    // `--refmap=`: no opportunistic update of `refs/remotes/origin/*`, so only this namespace moves.
    for (const source of [`refs/heads/${pull.headRef}`, `refs/pull/${pull.number}/head`]) {
      await runRemoteGit(this.deps.git, credentials, this.deps.env, ['fetch', '--quiet', '--no-tags', '--refmap=', 'origin', `+${source}:${ref}`], {
        cwd: store.root,
        allowFailure: true,
      });
      if (await this.hasCommit(store, pull.headSha)) return true;
    }
    return false;
  }

  /** Every file under the configured publish path at `commit`, keyed by its path under that publish path. */
  private async listing(store: Store, commit: string): Promise<Map<string, string>> {
    const prefix = await storePrefix(this.deps.git, store.root);
    const publish = `${prefix}${store.config.publish.path.split('\\').join('/').replace(/\/+$/, '')}/`;
    const key = `${commit}\0${publish}`;
    const cached = this.listings.get(key);
    if (cached !== undefined) return cached;
    const tree = await this.deps.git.run(['ls-tree', '-r', '-z', '--full-tree', commit, '--', publish], { cwd: store.root, allowFailure: true });
    const files = new Map<string, string>();
    for (const entry of tree.exitCode === 0 ? tree.stdout.split('\0') : []) {
      const tab = entry.indexOf('\t');
      if (tab === -1) continue;
      const [mode, type, object] = entry.slice(0, tab).split(' ');
      const filePath = entry.slice(tab + 1);
      // Regular files only, as `walkFiles` takes them from disk: no symbolic link, no submodule.
      if (type !== 'blob' || mode === '120000' || !filePath.startsWith(publish)) continue;
      files.set(filePath.slice(publish.length), object!);
    }
    if (this.listings.size >= MAX_LISTINGS) this.listings.delete(this.listings.keys().next().value!);
    this.listings.set(key, files);
    return files;
  }
}
