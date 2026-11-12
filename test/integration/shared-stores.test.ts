import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

/**
 * mount-shared-stores: two stores made by `ctxr init`, each with a bare
 * origin. `ctx-a` mounts `ctx-b`. Fixture commits skip the hooks; the one test
 * about the commit gate commits with them.
 */
interface Pair {
  tmp: TmpDir;
  env: Record<string, string | undefined>;
  a: string;
  b: string;
  aOrigin: string;
  bOrigin: string;
  git(args: readonly string[], cwd: string): Promise<string>;
  cli(args: readonly string[], cwd: string, env?: Record<string, string | undefined>): Promise<{ exitCode: number; stdout: string; stderr: string; json: any }>;
  writeFiles(cwd: string, files: Record<string, string>): Promise<void>;
  /** Commits `files` in a scratch clone of `origin` and pushes, as a change landed elsewhere would. */
  advance(origin: string, files: Record<string, string>): Promise<string>;
}

async function makePair(opts: { mounts?: string; bFiles?: Record<string, string>; aFiles?: Record<string, string>; bExclude?: string[] } = {}): Promise<Pair> {
  const tmp = await makeTmpDir();
  const env = hermeticGitEnv();
  const git = async (args: readonly string[], cwd: string) => (await execFileAsync('git', [...args], { cwd, env: env as NodeJS.ProcessEnv })).stdout.trim();
  const cli = async (args: readonly string[], cwd: string, extraEnv: Record<string, string | undefined> = {}) => {
    const r = await runCli([...args, '--json'], { cwd, env: { ...env, ...extraEnv }, timeoutMs: 60_000 });
    let json: unknown = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
    return { ...r, json };
  };
  const writeFiles = async (cwd: string, files: Record<string, string>) => {
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(cwd, rel)), { recursive: true });
      await writeFile(path.join(cwd, rel), text);
    }
  };

  const makeStore = async (name: string, files: Record<string, string>, extraConfig: string) => {
    const root = path.join(tmp.root, name);
    const origin = path.join(tmp.root, `${name}.git`);
    await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: env as NodeJS.ProcessEnv });
    await mkdir(root, { recursive: true });
    await git(['init', '-q', '-b', 'main'], root);
    const init = await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: root, env, timeoutMs: 60_000 });
    if (init.exitCode !== 0) throw new Error(`init failed: ${init.stderr}${init.stdout}`);
    if (extraConfig) await appendFile(path.join(root, 'contexture.yaml'), extraConfig);
    if (name === 'ctx-b' && opts.bExclude) {
      const configPath = path.join(root, 'contexture.yaml');
      const text = await readFile(configPath, 'utf8');
      await writeFile(configPath, text.replace('retrieval:\n', `retrieval:\n  exclude_paths: [${opts.bExclude.map((p) => `"${p}"`).join(', ')}]\n`));
    }
    await writeFiles(root, files);
    const built = await runCli(['catalog', 'build'], { cwd: root, env, timeoutMs: 60_000 });
    if (built.exitCode !== 0) throw new Error(`catalog build failed: ${built.stderr}${built.stdout}`);
    await git(['add', '-A'], root);
    await git(['commit', '-q', '--no-verify', '-m', 'fixture'], root);
    await git(['remote', 'add', 'origin', origin], root);
    await git(['push', '-q', '--no-verify', 'origin', 'main'], root);
    await git(['fetch', '-q', 'origin'], root);
    return { root, origin };
  };

  const b = await makeStore('ctx-b', opts.bFiles ?? { 'projects/ctx-note.md': '# Ctx note\n', 'areas/ctx-person.md': '# Ctx person\n' }, '');
  const mounts = opts.mounts ?? `shared_stores:\n  - { name: ctx-b, url: "${b.origin}" }\n`;
  const a = await makeStore('ctx-a', opts.aFiles ?? { 'areas/ctx-person.md': '# Own person\n' }, mounts);

  return {
    tmp,
    env,
    a: a.root,
    b: b.root,
    aOrigin: a.origin,
    bOrigin: b.origin,
    git,
    cli,
    writeFiles,
    async advance(origin, files) {
      const scratch = path.join(tmp.root, `scratch-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await git(['clone', '-q', origin, scratch], tmp.root);
      await writeFiles(scratch, files);
      await git(['add', '-A'], scratch);
      await git(['commit', '-q', '--no-verify', '-m', 'advance'], scratch);
      await git(['push', '-q', '--no-verify', 'origin', 'main'], scratch);
      return git(['rev-parse', 'HEAD'], scratch);
    },
  };
}

const mountRoot = (p: Pair) => path.join(p.a, 'shared', 'ctx-b');

describe('ctxr shared-stores sync and status', () => {
  it('clones an absent mount, ignores it through the local exclude file, and leaves no tracked change', async () => {
    const p = await makePair();
    try {
      const r = await p.cli(['shared-stores', 'sync'], p.a);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(r.json.data.mounts).toEqual([expect.objectContaining({ name: 'ctx-b', location: 'shared/ctx-b', outcome: 'cloned' })]);
      expect(existsSync(path.join(mountRoot(p), 'contexture.yaml'))).toBe(true);
      expect(await readFile(path.join(p.a, '.git', 'info', 'exclude'), 'utf8')).toContain('/shared/');
      expect(await p.git(['status', '--porcelain'], p.a)).toBe('');

      const status = await p.cli(['shared-stores', 'status'], p.a);
      expect(status.json.data.mounts).toEqual([
        expect.objectContaining({ name: 'ctx-b', present: true, isStore: true, branch: 'main', dirty: false }),
      ]);
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('fast-forwards a mount that is behind, naming both commits', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const before = await p.git(['rev-parse', 'HEAD'], mountRoot(p));
      const after = await p.advance(p.bOrigin, { 'projects/later.md': '# Later\n' });
      const r = await p.cli(['shared-stores', 'sync'], p.a);
      expect(r.exitCode).toBe(0);
      expect(r.json.data.mounts[0]).toMatchObject({ outcome: 'fast_forwarded', from: before, to: after });
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('leaves a mount with local work alone, as a warning that does not fail the run', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      await appendFile(path.join(mountRoot(p), 'projects', 'ctx-note.md'), 'being edited\n');
      await p.advance(p.bOrigin, { 'projects/later.md': '# Later\n' });
      const before = await p.git(['rev-parse', 'HEAD'], mountRoot(p));
      const r = await p.cli(['shared-stores', 'sync'], p.a);
      expect(r.exitCode).toBe(0);
      expect(r.json.data.mounts[0]).toMatchObject({ outcome: 'left_alone' });
      expect(r.json.data.mounts[0].reason).toContain('uncommitted');
      expect(r.json.findings).toEqual([expect.objectContaining({ code: 'shared_stores.mount_left_alone', severity: 'warning' })]);
      expect(await p.git(['rev-parse', 'HEAD'], mountRoot(p))).toBe(before);
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('fails the run for an unreachable mount, after processing the others', async () => {
    const p = await makePair({ mounts: '' });
    try {
      await appendFile(
        path.join(p.a, 'contexture.yaml'),
        `shared_stores:\n  - { name: ctx-gone, url: "${path.join(p.tmp.root, 'missing.git')}" }\n  - { name: ctx-b, url: "${p.bOrigin}" }\n`,
      );
      const r = await p.cli(['shared-stores', 'sync'], p.a);
      expect(r.exitCode, r.stdout).toBe(3);
      expect(r.json.data.mounts.map((m: { name: string; outcome: string }) => [m.name, m.outcome])).toEqual([
        ['ctx-gone', 'failed'],
        ['ctx-b', 'cloned'],
      ]);
      expect(r.json.findings).toEqual([expect.objectContaining({ code: 'shared_stores.mount_unreachable', subject: 'shared/ctx-gone' })]);
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('status reports an absent mount and changes nothing', async () => {
    const p = await makePair();
    try {
      const before = await p.git(['status', '--porcelain', '--ignored'], p.a);
      const r = await p.cli(['shared-stores', 'status'], p.a);
      expect(r.exitCode).toBe(0);
      expect(r.json.data.mounts).toEqual([expect.objectContaining({ name: 'ctx-b', present: false })]);
      expect(r.stdout + r.stderr).not.toContain('error');
      expect(await p.git(['status', '--porcelain', '--ignored'], p.a)).toBe(before);
      expect(existsSync(path.join(p.a, 'shared'))).toBe(false);
    } finally {
      await p.tmp.cleanup();
    }
  });
});

describe('the read view and link resolution', () => {
  it('carries mounted notes under their prefix, admitted by their own store, and keeps the own catalog to own notes', async () => {
    const p = await makePair({
      bExclude: ['.contexture/', 'raw/', 'resources/'],
      bFiles: { 'projects/ctx-note.md': '# Ctx note\n', 'resources/hidden.md': '# Hidden by ctx-b\n' },
      aFiles: { 'projects/own.md': '# Own\n\n[[shared/ctx-b/projects/ctx-note]]\n' },
    });
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const built = await p.cli(['graph', 'build'], p.a);
      expect(built.exitCode, built.stdout + built.stderr).toBe(0);
      const graph = JSON.parse(await readFile(path.join(p.a, '.contexture', 'cache', 'graph.json'), 'utf8')) as { nodes: { id: string }[]; edges: { src: string; dst: string }[] };
      const ids = graph.nodes.map((n) => n.id);
      expect(ids).toContain('shared/ctx-b/projects/ctx-note.md');
      expect(ids).not.toContain('shared/ctx-b/resources/hidden.md');
      expect(ids.filter((id) => id.startsWith('shared/ctx-b/.contexture'))).toEqual([]);
      expect(graph.edges).toContainEqual(expect.objectContaining({ src: 'projects/own.md', dst: 'shared/ctx-b/projects/ctx-note.md' }));

      const check = await p.cli(['catalog', 'check'], p.a);
      expect(check.exitCode, check.stdout).toBe(0);
      const query = await p.cli(['context', 'gather', '--seed', 'projects/own.md'], p.a);
      expect(query.exitCode, query.stdout + query.stderr).toBe(0);
      expect(JSON.stringify(query.json.data)).toContain('shared/ctx-b/projects/ctx-note.md');
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('keeps a filename shared across stores unambiguous, and never resolves a mounted note into the mounting store', async () => {
    const p = await makePair({
      bFiles: { 'areas/ctx-person.md': '# Theirs\n', 'projects/leak.md': '# Leak\n\n[[ctx-private]]\n' },
      aFiles: { 'areas/ctx-person.md': '# Mine\n', 'projects/ctx-private.md': '# Private\n', 'projects/own.md': '# Own\n\n[[ctx-person]]\n' },
    });
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      await p.cli(['graph', 'build'], p.a);
      const doctor = await p.cli(['doctor'], p.a);
      const ambiguous = doctor.json.data.checks.find((c: { id: string }) => c.id === 'graph.ambiguous_links');
      expect(ambiguous.result).toBe('pass');

      const lint = await p.cli(['lint'], p.a);
      const disclosures = lint.json.findings.filter((f: { code: string }) => f.code === 'shared_stores.shared_note_names_private_note');
      expect(disclosures).toEqual([
        expect.objectContaining({ subject: 'shared/ctx-b/projects/leak.md', details: { target: 'ctx-private', names: 'projects/ctx-private.md' } }),
      ]);
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('reads the mounts of the main working tree from a session worktree', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const started = await p.cli(['session', 'start', 'ctx-work'], p.a);
      expect(started.exitCode, started.stdout + started.stderr).toBe(0);
      const worktree = started.json.data.worktree as string;
      const built = await p.cli(['graph', 'build'], worktree);
      expect(built.exitCode, built.stdout + built.stderr).toBe(0);
      const graph = JSON.parse(await readFile(path.join(worktree, '.contexture', 'cache', 'graph.json'), 'utf8')) as { nodes: { id: string }[] };
      expect(graph.nodes.map((n) => n.id)).toContain('shared/ctx-b/projects/ctx-note.md');
      // The local exclude entry lives in the common git directory, so the session worktree ignores shared/ too.
      await p.writeFiles(worktree, { 'shared/stray.md': '# Stray\n' });
      expect(await p.git(['status', '--porcelain'], worktree)).toBe('');
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('reports an absent mount from graph build without failing it', async () => {
    const p = await makePair();
    try {
      const built = await p.cli(['graph', 'build'], p.a);
      expect(built.exitCode).toBe(0);
      expect(built.json.data.unavailableMounts).toEqual([{ name: 'ctx-b', location: 'shared/ctx-b', state: 'absent' }]);
      expect(built.json.findings).toContainEqual(expect.objectContaining({ code: 'shared_stores.mount_unavailable' }));
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('catalog show appends the same section of each mount, with prefixed paths, and writes nothing', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const before = await p.git(['status', '--porcelain'], p.a);
      const r = await p.cli(['catalog', 'show', '--section', 'projects'], p.a);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(r.json.data.mounts).toEqual([
        { name: 'ctx-b', location: 'shared/ctx-b', entries: [expect.stringContaining('(`shared/ctx-b/projects/ctx-note.md`)')] },
      ]);
      expect(await p.git(['status', '--porcelain'], p.a)).toBe(before);
      expect(await p.git(['status', '--porcelain'], mountRoot(p))).toBe('');
    } finally {
      await p.tmp.cleanup();
    }
  });
});

describe('writing to a mount, and keeping mounted content out of the mounting store', () => {
  it('starts a session run inside a mount in the mounted store, under CONTEXTURE_STORE_ROOT', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const r = await p.cli(['session', 'start', 'ctx-shared-work'], mountRoot(p), { CONTEXTURE_STORE_ROOT: p.a });
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      const worktree = r.json.data.worktree as string;
      expect(worktree.startsWith(path.join(mountRoot(p), '.worktrees'))).toBe(true);
      expect(await p.git(['branch', '--list', r.json.data.branch], mountRoot(p))).toContain(r.json.data.branch);
      expect(existsSync(path.join(p.a, '.worktrees')) ? await readdir(path.join(p.a, '.worktrees')) : []).toEqual([]);
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('refuses a commit that stages content under shared/, through the pre-commit hook', async () => {
    const p = await makePair();
    try {
      await p.writeFiles(p.a, { 'shared/stray.md': '# Stray\n' });
      await p.git(['add', '-f', 'shared/stray.md'], p.a);
      const commit = await execFileAsync('git', ['commit', '-q', '-m', 'stray'], { cwd: p.a, env: p.env as NodeJS.ProcessEnv }).then(
        () => ({ code: 0, out: '' }),
        (err: { code: number; stdout: string; stderr: string }) => ({ code: err.code, out: `${err.stdout}${err.stderr}` }),
      );
      expect(commit.code).not.toBe(0);
      expect(commit.out).toContain('shared/stray.md');
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('passes the untracked-mount check when mounts are present and untracked', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      const doctor = await p.cli(['doctor'], p.a);
      const check = doctor.json.data.checks.find((c: { id: string }) => c.id === 'shared_stores.untracked');
      expect(check.result).toBe('pass');
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('renders the shared-stores section after placement on update, and none in a store without mounts', async () => {
    const p = await makePair();
    try {
      const updated = await p.cli(['update'], p.a);
      expect(updated.exitCode, updated.stdout + updated.stderr).toBe(0);
      const agents = await readFile(path.join(p.a, 'AGENTS.md'), 'utf8');
      const placement = agents.indexOf('contexture:placement');
      const shared = agents.indexOf('contexture:shared-stores');
      const conventions = agents.indexOf('contexture:conventions');
      expect(placement).toBeGreaterThan(-1);
      expect(shared).toBeGreaterThan(placement);
      expect(conventions).toBeGreaterThan(shared);
      expect(agents).toContain('`shared/ctx-b/`');
      expect(await readFile(path.join(p.b, 'AGENTS.md'), 'utf8')).not.toContain('contexture:shared-stores');
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('end to end: a change landed in the mount reaches the mounting store\'s view on the next sync', async () => {
    const p = await makePair();
    try {
      await p.cli(['shared-stores', 'sync'], p.a);
      await p.advance(p.bOrigin, { 'projects/landed.md': '# Landed in ctx-b\n' });
      await p.cli(['shared-stores', 'sync'], p.a);
      await p.writeFiles(p.a, { 'projects/own.md': '# Own\n\n[[shared/ctx-b/projects/landed]]\n' });
      const built = await p.cli(['graph', 'build'], p.a);
      expect(built.json.data.dangling).toEqual([]);
      const graph = JSON.parse(await readFile(path.join(p.a, '.contexture', 'cache', 'graph.json'), 'utf8')) as { edges: { src: string; dst: string }[] };
      expect(graph.edges).toContainEqual(expect.objectContaining({ src: 'projects/own.md', dst: 'shared/ctx-b/projects/landed.md' }));
    } finally {
      await p.tmp.cleanup();
    }
  });
});
