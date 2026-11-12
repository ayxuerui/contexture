import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execute as executeDoctor } from '../../src/commands/doctor.js';
import { execute as executeLint } from '../../src/commands/lint.js';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { disposablePageDueCheck, pageRepresentationCheck, sendCopyNameCheck } from '../../src/core/checks/organize-checks.js';
import { CHECKS } from '../../src/core/checks/manifest.js';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
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

const NOTE_BODY = '# Ctx note\n\nFacts.\n';

async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), text);
}

async function page(root: string, folder: string, readme: string): Promise<void> {
  await put(root, `publish/${folder}/index.html`, '<html></html>\n');
  await put(root, `publish/${folder}/README.md`, readme);
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else out[child] = await readFile(path.join(dir, child), 'utf8');
    }
  }
  await walk('');
  return out;
}

function onDate(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
}

/** two-kinds-of-published-page D6: lint reports, nobody deletes, and doctor reports neither condition. */
describe('lint: disposable pages past their window', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is an observation, never a doctor invariant', () => {
    expect(disposablePageDueCheck.severity).toBe('observation');
    expect(pageRepresentationCheck.severity).toBe('observation');
    expect(CHECKS.filter((c) => c.severity === 'invariant').map((c) => c.id)).not.toContain('organize.disposable_page_due');
    expect(CHECKS.filter((c) => c.severity === 'invariant').map((c) => c.id)).not.toContain('organize.page_representation');
  });

  it('lists a 45-day-old page with its age, skips a 10-day-old and an undated one, changes nothing, exits 0', async () => {
    onDate('2026-10-13');
    const tmp = await makeTmpDir();
    try {
      await page(tmp.root, 'disposable/2026-08-29-agent-week', '# old\n');
      await page(tmp.root, 'disposable/2026-10-03-agent-week', '# recent\n');
      await page(tmp.root, 'disposable/agent-week', '# undated\n');
      const before = await snapshot(path.join(tmp.root, 'publish'));

      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeLint(makeFakeEnv({ cwd: tmp.root }), store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      const due = outcome.findings.filter((f) => f.code === 'organize.disposable_page_due');
      expect(due.map((f) => f.subject)).toEqual(['publish/disposable/2026-08-29-agent-week']);
      expect(due[0]?.details).toMatchObject({ age_days: 45 });
      expect(due[0]?.message).toContain('45 days');
      expect(await snapshot(path.join(tmp.root, 'publish'))).toEqual(before);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('lint: permanent pages out of step with their note', () => {
  it('lists stale, unstamped and no-note pages, names the note, stays silent on a current page, exits 0', async () => {
    const tmp = await makeTmpDir();
    try {
      await put(tmp.root, 'projects/ctx-note.md', NOTE_BODY);
      const hash = contentHashOfBody(NOTE_BODY);
      await page(tmp.root, 'projects/current', `# p\n\n- [[ctx-note]] <!-- hash:${hash} -->\n`);
      await page(tmp.root, 'projects/stale', '# p\n\n- [[ctx-note]] <!-- hash:0000000000000000 -->\n');
      await page(tmp.root, 'projects/unstamped', '# p\n\n- [[ctx-note]]\n');
      await page(tmp.root, 'projects/no-note', '# p\n\nNo links.\n');
      await page(tmp.root, 'disposable/2026-10-13-x', '# disposable pages are never listed here\n');

      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeLint(makeFakeEnv({ cwd: tmp.root }), store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      const found = outcome.findings
        .filter((f) => f.code === 'organize.page_representation')
        .map((f) => [f.subject, (f.details as { condition: string; note: string | null }).condition, (f.details as { note: string | null }).note]);
      expect(found).toEqual([
        ['publish/projects/no-note', 'no-note', null],
        ['publish/projects/stale', 'stale', 'projects/ctx-note.md'],
        ['publish/projects/unstamped', 'not-stamped', 'projects/ctx-note.md'],
      ]);
    } finally {
      await tmp.cleanup();
    }
  });
});

/** send-copies-gated-at-commit: lint lists committed send copies whose names are not dated, and never fails. */
describe('lint: send copies without a dated name', () => {
  it('is an observation', () => {
    expect(sendCopyNameCheck.severity).toBe('observation');
  });

  it('lists an undated send copy on a permanent and a disposable page, and exits 0', async () => {
    const tmp = await makeTmpDir();
    try {
      await page(tmp.root, 'projects/model', '# p\n');
      await put(tmp.root, 'publish/projects/model/model.xlsx', 'xlsx');
      await put(tmp.root, 'publish/projects/model/2026-01-15-model.xlsx', 'xlsx');
      await put(tmp.root, 'publish/projects/model/assets/source-data.xlsx', 'xlsx');
      await put(tmp.root, 'publish/projects/model/data.csv', 'a,b');
      await page(tmp.root, 'disposable/2026-10-13-x', '# d\n');
      await put(tmp.root, 'publish/disposable/2026-10-13-x/brief.pdf', 'pdf');

      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeLint(makeFakeEnv({ cwd: tmp.root }), store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      const found = outcome.findings.filter((f) => f.code === 'organize.send_copy_name').map((f) => [f.subject, (f.details as { page: string }).page]);
      expect(found).toEqual([
        ['publish/disposable/2026-10-13-x/brief.pdf', 'publish/disposable/2026-10-13-x'],
        ['publish/projects/model/model.xlsx', 'publish/projects/model'],
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports nothing when every send copy is dated', async () => {
    const tmp = await makeTmpDir();
    try {
      await page(tmp.root, 'projects/brief', '# p\n');
      await put(tmp.root, 'publish/projects/brief/2026-01-15-brief.pdf', 'pdf');
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeLint(makeFakeEnv({ cwd: tmp.root }), store);
      expect(outcome.findings.some((f) => f.code === 'organize.send_copy_name')).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('doctor ignores page age and page representation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits as it did without them when a 400-day-old disposable page and an unstamped permanent page are present', async () => {
    onDate('2026-10-13');
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      // The first run repairs what it self-heals (hooks), so the baseline is the second.
      await executeDoctor(env, store);
      const baseline = await executeDoctor(env, store);

      await page(tmp.root, 'disposable/2025-09-08-agent-week', '# old\n');
      await page(tmp.root, 'projects/unstamped', '# p\n\n- [[nowhere]]\n');
      const outcome = await executeDoctor(env, store);

      expect(outcome.exitCode).toBe(baseline.exitCode);
      expect(outcome.findings.map((f) => f.code)).toEqual(baseline.findings.map((f) => f.code));
      expect(outcome.findings.some((f) => (f.subject ?? '').startsWith('publish/'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
