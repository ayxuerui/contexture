import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content = '# Note\n'): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

/** Task 4.6's literal verification. */
describe('contexture graph (real CLI)', () => {
  it('two fixture notes with identical filenames in different directories produce two distinct nodes', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/beta.md');
      await writeNote(tmp.root, 'areas/beta.md');

      const result = await runCli(['graph', 'build', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.nodeCount).toBe(2);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a fixture with a dangling link makes graph build exit 0 while reporting it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', 'Links to [[nowhere]].\n');

      const result = await runCli(['graph', 'build', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.data.dangling).toEqual([{ from: 'projects/a.md', target: 'nowhere', reason: 'not_found' }]);
      expect(data.findings.some((f: { code: string }) => f.code === 'graph.dangling_link')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('the generated AGENTS.md states the exclusion paths and the leg-routing rule naming catalog/graph/direct-grep', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const content = await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8');
      expect(content).toMatch(/catalog/i);
      expect(content).toMatch(/graph/i);
      expect(content).toMatch(/grep/i);
      expect(content).toMatch(/`\.contexture\/`/);
      expect(content).toMatch(/`\.worktrees\/`/);
      expect(content).toMatch(/no `ctxr search` command/i);
    } finally {
      await tmp.cleanup();
    }
  });

  it("the CLI's command surface contains no search command", async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const result = await runCli(['search', 'anything'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/unknown command/i);
    } finally {
      await tmp.cleanup();
    }
  });

  it('graph query works end to end: neighbors, path, hubs, orphans, subgraph', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', 'Links to [[b]].\n');
      await writeNote(tmp.root, 'projects/b.md', 'Links back to [[a]].\n');
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const neighbors = await runCli(['graph', 'query', 'neighbors', 'projects/a.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(neighbors.exitCode).toBe(0);
      expect(JSON.parse(neighbors.stdout).data.neighbors).toEqual(['projects/b.md']);

      const pathResult = await runCli(['graph', 'query', 'path', 'projects/a.md', 'projects/b.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(pathResult.exitCode).toBe(0);
      expect(JSON.parse(pathResult.stdout).data.path).toEqual(['projects/a.md', 'projects/b.md']);

      const hubsResult = await runCli(['graph', 'query', 'hubs', '--json'], { cwd: tmp.root, env });
      expect(hubsResult.exitCode).toBe(0);
      expect(JSON.parse(hubsResult.stdout).data.hubs.length).toBe(2);

      const orphansResult = await runCli(['graph', 'query', 'orphans', '--json'], { cwd: tmp.root, env });
      expect(orphansResult.exitCode).toBe(0);
      expect(JSON.parse(orphansResult.stdout).data.orphans).toEqual([]);

      const subgraphResult = await runCli(['graph', 'query', 'subgraph', 'projects/a.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(subgraphResult.exitCode).toBe(0);
      expect(JSON.parse(subgraphResult.stdout).data.nodes).toEqual([{ id: 'projects/a.md', path: 'projects/a.md', cluster: 'projects' }]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a graph carrying a note the store no longer admits is refused, and a rebuild restores the query', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/kept.md', '# Kept\n\n[[secret]]\n');
      await writeNote(tmp.root, 'projects/secret.md', '# Secret\n');
      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);

      // Declare the exclusion AFTER the build: the persisted graph is now
      // over-inclusive, and answering from it would surface excluded material.
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const config = await readFile(configPath, 'utf8');
      await writeFile(configPath, config.replace('exclude_paths:', 'exclude_paths:\n    - projects/secret.md'));

      const refused = await runCli(['graph', 'query', 'hubs', '--json'], { cwd: tmp.root, env });
      expect(refused.exitCode).not.toBe(0);
      const finding = JSON.parse(refused.stdout).findings[0];
      expect(finding.code).toBe('graph.carries_excluded_note');
      expect(finding.message).toContain('projects/secret.md');
      expect(finding.message).toContain('ctxr graph build');

      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const after = await runCli(['graph', 'query', 'hubs', '--json'], { cwd: tmp.root, env });
      expect(after.exitCode).toBe(0);
      expect(after.stdout).not.toContain('projects/secret.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a graph merely missing a newly added note still answers, since it withholds nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/one.md');
      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await writeNote(tmp.root, 'projects/two.md');

      const result = await runCli(['graph', 'query', 'hubs', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('graph query before a build exits with a usage error naming the missing artifact', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const result = await runCli(['graph', 'query', 'orphans', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).findings[0].code).toBe('graph.not_built');
    } finally {
      await tmp.cleanup();
    }
  });

  it('graph build --emit-records includes a stable per-note record list', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\n---\nHello.\n');
      const result = await runCli(['graph', 'build', '--emit-records', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const records = JSON.parse(result.stdout).data.records;
      expect(records).toEqual([
        { id: 'projects/a.md', path: 'projects/a.md', gloss: '', hash: expect.any(String) },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });
});
