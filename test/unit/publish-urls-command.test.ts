import { execFileSync } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { execute } from '../../src/commands/publish-urls.js';
import { PublishChangeSetRequiredError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' });
}

async function put(root: string, file: string, text = '<html></html>\n'): Promise<void> {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), text);
}

/** A repo with a base commit holding one page, rooted at `.worktrees/session-a` when `worktree`. */
async function fixture(worktree: boolean): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const tmp = await makeTmpDir();
  const root = worktree ? path.join(tmp.root, '.worktrees', 'session-a') : tmp.root;
  await mkdir(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  await put(root, 'publish/ctx-a/old-page/index.html', '<p>one</p>\n');
  await put(root, 'publish/ctx-a/stable/index.html', '<p>stable</p>\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'branch', 'base');
  return { root, cleanup: tmp.cleanup };
}

const since = (store: Store) => execute(store, { staged: false, since: 'base' });

describe('publish urls', () => {
  it('reports an added page at its preview and published addresses in a session worktree', async () => {
    const fx = await fixture(true);
    try {
      await put(fx.root, 'publish/ctx-a/new-page/index.html');
      git(fx.root, 'add', '-A');
      git(fx.root, 'commit', '-q', '-m', 'add');
      const { data } = await since({ root: fx.root, config: makeConfig() });
      expect(data?.pages).toEqual([
        {
          status: 'added',
          path: 'publish/ctx-a/new-page',
          preview: { route: '/preview/session-a/ctx-a/new-page/index.html', url: null },
          published: { route: '/publish/ctx-a/new-page/index.html', url: null },
          moved_from: null,
        },
      ]);
      expect(data?.base_url_declared).toBe(false);
    } finally {
      await fx.cleanup();
    }
  });

  it('names the old address of a moved page', async () => {
    const fx = await fixture(true);
    try {
      await mkdir(path.join(fx.root, 'publish/subject'), { recursive: true });
      await rename(path.join(fx.root, 'publish/ctx-a/old-page'), path.join(fx.root, 'publish/subject/old-page'));
      git(fx.root, 'add', '-A');
      git(fx.root, 'commit', '-q', '-m', 'move');
      const { data } = await since({ root: fx.root, config: makeConfig({ serve: { base_url: 'https://ex.test/ctx/' } }) });
      expect(data?.pages).toHaveLength(1);
      const page = data!.pages[0]!;
      expect(page.status).toBe('moved');
      expect(page.published.url).toBe('https://ex.test/ctx/publish/subject/old-page/index.html');
      expect(page.moved_from).toEqual({
        path: 'publish/ctx-a/old-page',
        published: { route: '/publish/ctx-a/old-page/index.html', url: 'https://ex.test/ctx/publish/ctx-a/old-page/index.html' },
      });
    } finally {
      await fx.cleanup();
    }
  });

  it('reports a removed page with no preview', async () => {
    const fx = await fixture(true);
    try {
      await rm(path.join(fx.root, 'publish/ctx-a/old-page'), { recursive: true });
      git(fx.root, 'add', '-A');
      git(fx.root, 'commit', '-q', '-m', 'rm');
      const { data } = await since({ root: fx.root, config: makeConfig() });
      expect(data?.pages.map((p) => [p.status, p.preview])).toEqual([['removed', null]]);
    } finally {
      await fx.cleanup();
    }
  });

  it('drops the preview when serve.previews is none', async () => {
    const fx = await fixture(true);
    try {
      await put(fx.root, 'publish/ctx-a/new-page/index.html');
      git(fx.root, 'add', '-A');
      git(fx.root, 'commit', '-q', '-m', 'add');
      const { data } = await since({ root: fx.root, config: makeConfig({ serve: { previews: 'none' } }) });
      expect(data?.pages[0]?.preview).toBeNull();
      expect(data?.pages[0]?.published.route).toBe('/publish/ctx-a/new-page/index.html');
    } finally {
      await fx.cleanup();
    }
  });

  it('reports only the published address outside a session worktree, and reads --staged', async () => {
    const fx = await fixture(false);
    try {
      await put(fx.root, 'publish/ctx-a/stable/index.html', '<p>changed</p>\n');
      git(fx.root, 'add', '-A');
      const { data } = await execute({ root: fx.root, config: makeConfig() }, { staged: true, since: undefined });
      expect(data?.pages.map((p) => [p.status, p.preview])).toEqual([['modified', null]]);
    } finally {
      await fx.cleanup();
    }
  });

  it('ignores files that are not a page index or lie outside the publish path', async () => {
    const fx = await fixture(true);
    try {
      await put(fx.root, 'publish/ctx-a/stable/README.md', 'x');
      await put(fx.root, 'notes/index.html');
      git(fx.root, 'add', '-A');
      git(fx.root, 'commit', '-q', '-m', 'other');
      const outcome = await since({ root: fx.root, config: makeConfig() });
      expect(outcome.data?.pages).toEqual([]);
      expect(outcome.exitCode).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it('requires the change set to be named exactly once', async () => {
    const store: Store = { root: '/nowhere', config: makeConfig() };
    await expect(execute(store, { staged: false, since: undefined })).rejects.toThrow(PublishChangeSetRequiredError);
    await expect(execute(store, { staged: true, since: 'base' })).rejects.toThrow(PublishChangeSetRequiredError);
  });
});
