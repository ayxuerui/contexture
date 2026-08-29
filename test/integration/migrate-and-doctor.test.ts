import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function pinToSchemaV1(root: string): Promise<void> {
  const configPath = path.join(root, 'contexture.yaml');
  const text = await readFile(configPath, 'utf8');
  await writeFile(
    configPath,
    text.replace('schema_version: 2', 'schema_version: 1').replace('visibility: lens', 'visibility: scope'),
  );
}

/** Task 9.5's literal verification. */
describe('migrate and doctor aggregation (real CLI)', () => {
  it('migrate --dry-run against a store pinned one schema version behind prints the exact deltas, leaving files unchanged', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await pinToSchemaV1(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');

      const configBefore = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const noteBefore = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');

      const result = await runCli(['migrate', '--dry-run', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.applied).toBe(false);
      const paths = data.migrations[0].deltas.map((d: { path: string }) => d.path).sort();
      expect(paths).toEqual(['contexture.yaml', 'projects/a.md']);

      const configAfter = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const noteAfter = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(configAfter).toBe(configBefore);
      expect(noteAfter).toBe(noteBefore);
    } finally {
      await tmp.cleanup();
    }
  });

  it('running the rename migration for real, then resolving a note visibility, works under the new key with no other code change', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await pinToSchemaV1(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');

      const migrate = await runCli(['migrate', '--json'], { cwd: tmp.root, env });
      expect(migrate.exitCode).toBe(0);

      const resolve = await runCli(['note', 'resolve', 'projects/a.md', '--json'], { cwd: tmp.root, env });
      expect(resolve.exitCode).toBe(0);
      const data = JSON.parse(resolve.stdout).data;
      expect(data).toEqual({ path: 'projects/a.md', visibility: 'shared', reason: 'explicit' });
    } finally {
      await tmp.cleanup();
    }
  });

  it('doctor --json on a deliberately broken store reports a dangling link, an oversized catalog section, and a missing hook as distinct failing checks', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\n---\nLinks to [[nowhere]].\n');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      // Oversized catalog section: pad well past the default 32KiB budget.
      const catalogPath = path.join(tmp.root, '.contexture/catalog', 'projects.md');
      const catalogContent = await readFile(catalogPath, 'utf8');
      await writeFile(catalogPath, catalogContent + '\n' + 'x'.repeat(40_000));

      // Missing hook.
      const { rm } = await import('node:fs/promises');
      await rm(path.join(tmp.root, '.githooks', 'pre-commit'));

      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const checks: { id: string; result: string }[] = JSON.parse(result.stdout).data.checks;
      const byId = (id: string) => checks.find((c) => c.id === id);

      expect(byId('graph.dangling_links')?.result).toBe('fail');
      expect(byId('catalog.section_size')?.result).toBe('fail');
      expect(byId('git.hooks_health')?.result).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('no check id doctor treats as a failing invariant is also reported by lint (task 9.4)', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      // Trip every dual-tracked condition at once: fail-closed visibility,
      // a missing catalog entry, and a broken link.
      await writeNote(tmp.root, 'projects/untagged.md', 'No frontmatter at all.\n');
      await writeNote(tmp.root, 'projects/broken.md', '---\nlens: shared\n---\nLinks to [[missing]].\n');
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const doctorResult = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      const lintResult = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(lintResult.exitCode).toBe(0); // lint always exits 0, regardless of doctor's outcome

      const doctorIds = new Set(JSON.parse(doctorResult.stdout).data.checks.map((c: { id: string }) => c.id));
      const lintIds = new Set(JSON.parse(lintResult.stdout).data.checks.map((c: { id: string }) => c.id));
      const overlap = [...doctorIds].filter((id) => lintIds.has(id));
      expect(overlap).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
