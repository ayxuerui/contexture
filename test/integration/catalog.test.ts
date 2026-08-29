import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

/** Task 3.7's literal verification. */
describe('contexture catalog (real CLI)', () => {
  it('running catalog build twice in a row produces byte-identical output', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md');

      const first = await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);
      const contentBefore = await readFile(path.join(tmp.root, 'catalog', 'projects.md'), 'utf8');

      const second = await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(0);
      const contentAfter = await readFile(path.join(tmp.root, 'catalog', 'projects.md'), 'utf8');

      expect(contentAfter).toBe(contentBefore);
    } finally {
      await tmp.cleanup();
    }
  });

  it('deleting a note and re-running catalog check exits non-zero naming it; re-adding and rebuilding makes it exit 0', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'areas/beta.md');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });

      await rm(path.join(tmp.root, 'areas', 'beta.md'));
      const checkAfterDelete = await runCli(['catalog', 'check', '--json'], { cwd: tmp.root, env });
      expect(checkAfterDelete.exitCode).not.toBe(0);
      const deleteData = JSON.parse(checkAfterDelete.stdout);
      expect(deleteData.data.dangling).toContain('areas/beta.md');

      await writeNote(tmp.root, 'areas/beta.md');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      const checkAfterReadd = await runCli(['catalog', 'check', '--json'], { cwd: tmp.root, env });
      expect(checkAfterReadd.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('catalog check fails on a note with no catalog entry at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/uncataloged.md');
      const result = await runCli(['catalog', 'check', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.data.missing).toContain('projects/uncataloged.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('catalog coverage is wired into doctor', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/uncataloged.md');
      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.data.checks.some((c: { id: string; result: string }) => c.id === 'catalog.coverage' && c.result === 'fail')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('catalog show prints a section, and errors on an unknown section', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });

      const shown = await runCli(['catalog', 'show', '--section', 'projects', '--json'], { cwd: tmp.root, env });
      expect(shown.exitCode).toBe(0);
      expect(JSON.parse(shown.stdout).data.content).toContain('projects/a.md');

      const unknown = await runCli(['catalog', 'show', '--section', 'nonexistent', '--json'], { cwd: tmp.root, env });
      expect(unknown.exitCode).not.toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
