import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeCheck } from '../../src/commands/publish-check.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { PublishPageNotFoundError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
  };
}

const GOOD_HTML = [
  '<!doctype html>',
  '<html><head><meta name="viewport" content="width=device-width"><style>@media print{.x{display:none}}</style></head>',
  '<body><p><span>2026-09-01</span> <a href="./README.md">spec</a></p></body></html>',
  '',
].join('\n');

async function writePage(root: string, slug: string, html: string, readme: string | null = ''): Promise<string> {
  const dir = path.join(root, 'publish', slug);
  await mkdir(dir, { recursive: true });
  const htmlPath = path.join(dir, 'index.html');
  await writeFile(htmlPath, html);
  if (readme !== null) await writeFile(path.join(dir, 'README.md'), readme);
  return htmlPath;
}

describe('publish check', () => {
  it('passes a page satisfying every invariant', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'good', GOOD_HTML);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({ path: 'publish/good/index.html', passed: true, failures: [] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws PublishPageNotFoundError for a path that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeCheck(store, { path: path.join(tmp.root, 'publish/nope/index.html') })).rejects.toBeInstanceOf(
        PublishPageNotFoundError,
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page missing its sibling README', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'no-readme', GOOD_HTML, null);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('sibling-readme');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page referencing an external network resource', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('<style>', '<script src="https://cdn.example.com/x.js"></script><style>');
      const htmlPath = await writePage(tmp.root, 'cdn', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('no-external-references');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails, names the check, and identifies the block for a syntactically invalid inline script', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('</body>', '<script>function broken( { console.log("x") }</script></body>');
      const htmlPath = await writePage(tmp.root, 'broken-js', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failure = outcome.data?.failures.find((f) => f.check === 'script-syntax');
      expect(failure?.message).toContain('block #0');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails when the sibling README declares the visibility field or a kind field', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const readme = '---\nscope: personal\nkind: living\n---\n# page\n';
      const htmlPath = await writePage(tmp.root, 'tagged-readme', GOOD_HTML, readme);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const messages = outcome.data?.failures.filter((f) => f.check === 'readme-frontmatter').map((f) => f.message) ?? [];
      expect(messages.some((m) => m.includes('visibility field'))).toBe(true);
      expect(messages.some((m) => m.includes('"kind"'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names every failing check in one run, not only the first', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = '<!doctype html><html><body>no viewport, no print rule, no provenance</body></html>';
      const htmlPath = await writePage(tmp.root, 'many-failures', html, null);

      const outcome = await executeCheck(store, { path: htmlPath });
      const checks = outcome.data?.failures.map((f) => f.check) ?? [];
      expect(checks).toContain('viewport-meta');
      expect(checks).toContain('print-rule');
      expect(checks).toContain('provenance-line');
      expect(checks).toContain('sibling-readme');
    } finally {
      await tmp.cleanup();
    }
  });
});
