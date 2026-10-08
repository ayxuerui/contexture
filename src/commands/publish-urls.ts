import { pageServedAt } from '../core/browse/page-url.js';
import { PUBLISH_INDEX_FILE } from '../core/browse/routes.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PublishChangeSetRequiredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { createExecFileGitRunner } from '../core/git/exec.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishUrlsFlags {
  staged: boolean;
  since: string | undefined;
}

export interface PageAddress {
  route: string;
  /** Against `serve.base_url`; null when the store declares none. */
  url: string | null;
}

export type PageStatus = 'added' | 'modified' | 'moved' | 'removed';

export interface PageUrlEntry {
  status: PageStatus;
  /** The page's folder under the store root, "/"-separated. */
  path: string;
  /** Null for a removed page and wherever previews are off or the root is not a session worktree. */
  preview: PageAddress | null;
  published: PageAddress;
  /** For a moved page: where it was, and the address that stops working. */
  moved_from: { path: string; published: PageAddress } | null;
}

export interface PublishUrlsData {
  base_url_declared: boolean;
  pages: PageUrlEntry[];
}

interface Change {
  status: PageStatus;
  file: string;
  from: string | null;
}

/**
 * publish spec (a change set's pages): `--name-status -M` with paths relative
 * to the store root, so a store rooted below the repository's top level reads
 * the same as one at it. Rename detection is what turns a subject-folder move
 * into one entry rather than a removal plus an addition.
 */
async function readChanges(store: Store, flags: PublishUrlsFlags): Promise<Change[]> {
  const range = flags.staged ? ['--cached'] : [`${flags.since}...HEAD`];
  const { stdout } = await createExecFileGitRunner().run(
    ['diff', '--name-status', '-M', '--relative', '-z', ...range, '--'],
    { cwd: store.root },
  );
  const fields = stdout.split('\0');
  const changes: Change[] = [];
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i]!;
    if (code === '') continue;
    if (code.startsWith('R')) {
      changes.push({ status: 'moved', from: fields[i + 1]!, file: fields[i + 2]! });
      i += 2;
      continue;
    }
    const file = fields[++i]!;
    if (code === 'A') changes.push({ status: 'added', file, from: null });
    else if (code === 'D') changes.push({ status: 'removed', file, from: null });
    else changes.push({ status: 'modified', file, from: null });
  }
  return changes;
}

function isIndexFile(file: string): boolean {
  return file === PUBLISH_INDEX_FILE || file.endsWith(`/${PUBLISH_INDEX_FILE}`);
}

function pageDir(file: string): string {
  return file.slice(0, Math.max(0, file.length - PUBLISH_INDEX_FILE.length - 1));
}

/**
 * The published address is the durable one, so it is read from whichever field
 * of `pageServedAt` holds it: `route` outside a worktree, `after_landing`
 * inside one. A preview is only offered inside a worktree and only when the
 * store has not declared that previews never resolve for its reviewers.
 */
function addressesOf(store: Store, file: string): { preview: PageAddress | null; published: PageAddress } | null {
  const served = pageServedAt(store, file);
  if (served === null) return null;
  const previewsOff = store.config.serve?.previews === 'none';
  if (served.area === 'publish') return { preview: null, published: { route: served.route, url: served.url } };
  const landed = served.after_landing!;
  return {
    preview: previewsOff ? null : { route: served.route, url: served.url },
    published: { route: landed.route, url: landed.url },
  };
}

function entryFor(store: Store, change: Change): PageUrlEntry | null {
  if (!isIndexFile(change.file) && !(change.from !== null && isIndexFile(change.from))) return null;

  const current = isIndexFile(change.file) && change.status !== 'removed' ? addressesOf(store, change.file) : null;
  const old = change.from !== null && isIndexFile(change.from) ? addressesOf(store, change.from) : null;

  if (change.status === 'removed') {
    const gone = isIndexFile(change.file) ? addressesOf(store, change.file) : null;
    if (gone === null) return null;
    return { status: 'removed', path: pageDir(change.file), preview: null, published: gone.published, moved_from: null };
  }
  if (change.status === 'moved') {
    // Moved in from outside the publish path is a page arriving; moved out is a page going.
    if (current === null && old !== null) {
      return { status: 'removed', path: pageDir(change.from!), preview: null, published: old.published, moved_from: null };
    }
    if (current !== null && old === null) {
      return { status: 'added', path: pageDir(change.file), ...current, moved_from: null };
    }
    if (current === null) return null;
    return {
      status: 'moved',
      path: pageDir(change.file),
      ...current,
      moved_from: { path: pageDir(change.from!), published: old!.published },
    };
  }
  if (current === null) return null;
  return { status: change.status, path: pageDir(change.file), ...current, moved_from: null };
}

function show(address: PageAddress): string {
  return address.url ?? address.route;
}

export async function execute(store: Store, flags: PublishUrlsFlags): Promise<CommandOutcome<PublishUrlsData>> {
  const given = [...(flags.staged ? ['--staged'] : []), ...(flags.since !== undefined ? ['--since'] : [])];
  if (given.length !== 1) throw new PublishChangeSetRequiredError(given);

  const pages = (await readChanges(store, flags))
    .map((change) => entryFor(store, change))
    .filter((entry): entry is PageUrlEntry => entry !== null);
  const baseUrlDeclared = store.config.serve?.base_url !== undefined;

  const lines = pages.map((page) => {
    const parts = [`${page.status} ${page.path}`];
    if (page.preview !== null) parts.push(`preview ${show(page.preview)}`);
    parts.push(page.status === 'removed' ? `stops working: ${show(page.published)}` : `published ${show(page.published)}`);
    if (page.moved_from !== null) parts.push(`was ${page.moved_from.path}, old address ${show(page.moved_from.published)} stops working`);
    return parts.join(' | ');
  });
  if (pages.length > 0 && !baseUrlDeclared) lines.push('No serve.base_url is declared, so these are server-relative routes.');

  return {
    exitCode: ExitCode.Ok,
    data: { base_url_declared: baseUrlDeclared, pages },
    findings: [],
    humanSummary: pages.length === 0 ? 'No pages in the change set.' : lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
