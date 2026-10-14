import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeCheck } from '../../src/commands/publish-check.js';
import { execute as executeStamp } from '../../src/commands/publish-stamp.js';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';
import { PublishStampRefusedError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
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
  };
}

const NOTE_BODY = '# Ctx note\n\nThe note a page represents.\n';
const GOOD_HTML =
  '<!doctype html>\n<html><head><title>P</title><meta name="viewport" content="width=device-width"><style>@media print{.x{display:none}}</style></head>' +
  '<body><p><span>2026-09-01</span> <a href="./README.md">spec</a></p></body></html>\n';
const README = '---\ntitle: page\n---\n# page\n\n## Source notes\n\n- [[ctx-note]] — the note this page represents\n- [[ctx-note]] again, as a citation\n';

async function setup(slug = 'ctx-a/page', readme = README): Promise<{ root: string; store: Store; page: string; cleanup: () => Promise<void> }> {
  const tmp = await makeTmpDir();
  await mkdir(path.join(tmp.root, 'notes'), { recursive: true });
  await writeFile(path.join(tmp.root, 'notes', 'ctx-note.md'), NOTE_BODY);
  const page = path.join(tmp.root, 'publish', slug);
  await mkdir(page, { recursive: true });
  await writeFile(path.join(page, 'index.html'), GOOD_HTML);
  await writeFile(path.join(page, 'README.md'), readme);
  return { root: tmp.root, store: { root: tmp.root, config: makeConfig() }, page, cleanup: tmp.cleanup };
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir)).sort()) out[name] = await readFile(path.join(dir, name), 'utf8');
  return out;
}

/** two-kinds-of-published-page D5: the marker is written once, never overwritten. */
describe('publish stamp', () => {
  it('writes one marker on the lead-link line and changes nothing else in the folder', async () => {
    const t = await setup();
    try {
      const before = await snapshot(t.page);
      const outcome = await executeStamp(t.store, { path: t.page });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toMatchObject({ path: 'publish/ctx-a/page', note: 'notes/ctx-note.md', status: 'stamped', recorded: null });

      const after = await snapshot(t.page);
      expect(after['index.html']).toBe(before['index.html']);
      const expected = README.replace('the note this page represents\n', `the note this page represents <!-- hash:${contentHashOfBody(NOTE_BODY)} -->\n`);
      expect(after['README.md']).toBe(expected);
      expect(after['README.md']!.match(/<!-- hash:/g)).toHaveLength(1);
    } finally {
      await t.cleanup();
    }
  });

  it('accepts the index page path as well as the folder', async () => {
    const t = await setup();
    try {
      const outcome = await executeStamp(t.store, { path: path.join(t.page, 'index.html') });
      expect(outcome.data?.status).toBe('stamped');
    } finally {
      await t.cleanup();
    }
  });

  it('leaves the README byte-unchanged on a second run, and reports stale after a note edit', async () => {
    const t = await setup();
    try {
      await executeStamp(t.store, { path: t.page });
      const stamped = await readFile(path.join(t.page, 'README.md'), 'utf8');

      const again = await executeStamp(t.store, { path: t.page });
      expect(again.data?.status).toBe('current');
      expect(await readFile(path.join(t.page, 'README.md'), 'utf8')).toBe(stamped);

      await writeFile(path.join(t.root, 'notes', 'ctx-note.md'), `${NOTE_BODY}\nA new fact.\n`);
      const stale = await executeStamp(t.store, { path: t.page });
      expect(stale.data?.status).toBe('stale');
      expect(stale.humanSummary).toContain('stale');
      expect(await readFile(path.join(t.page, 'README.md'), 'utf8')).toBe(stamped);
    } finally {
      await t.cleanup();
    }
  });

  it('confirms a stale page once the marker is removed and the page stamped again', async () => {
    const t = await setup();
    try {
      await executeStamp(t.store, { path: t.page });
      await writeFile(path.join(t.root, 'notes', 'ctx-note.md'), `${NOTE_BODY}\nA new fact.\n`);
      const checkPath = path.join(t.page, 'index.html');
      expect((await executeCheck(t.store, { path: checkPath })).exitCode).toBe(ExitCode.CheckFailed);

      const readmePath = path.join(t.page, 'README.md');
      await writeFile(readmePath, (await readFile(readmePath, 'utf8')).replace(/ <!-- hash:[0-9a-f]{16} -->/, ''));
      expect((await executeStamp(t.store, { path: t.page })).data?.status).toBe('stamped');

      const check = await executeCheck(t.store, { path: checkPath });
      expect(check.data?.failures).toEqual([]);
      expect(check.exitCode).toBe(ExitCode.Ok);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses a disposable page, writing nothing', async () => {
    const t = await setup('disposable/2026-10-13-agent-week');
    try {
      const before = await snapshot(t.page);
      await expect(executeStamp(t.store, { path: t.page })).rejects.toBeInstanceOf(PublishStampRefusedError);
      await expect(executeStamp(t.store, { path: t.page })).rejects.toThrow(/disposable/);
      expect(await snapshot(t.page)).toEqual(before);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses an unresolvable lead link with the README byte-unchanged', async () => {
    const t = await setup('ctx-a/page', '# page\n\n- [[nowhere-note]]\n');
    try {
      const before = await snapshot(t.page);
      const error = await executeStamp(t.store, { path: t.page }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PublishStampRefusedError);
      expect((error as PublishStampRefusedError).exitCode).not.toBe(ExitCode.Ok);
      expect((error as PublishStampRefusedError).finding.message).toContain('nowhere-note');
      expect(await snapshot(t.page)).toEqual(before);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses a README that links no note', async () => {
    const t = await setup('ctx-a/page', '# page\n');
    try {
      await expect(executeStamp(t.store, { path: t.page })).rejects.toThrow(/links no note/);
    } finally {
      await t.cleanup();
    }
  });
});
