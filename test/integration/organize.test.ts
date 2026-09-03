import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

/** Task 7.5's literal verification. */
describe('contexture archive / rollup / lint (real CLI)', () => {
  it('archive on a note with two inbound links reports both linking notes and preserves git log --follow history', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/target.md', '---\nlens: shared\n---\nThe target note.\n');
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\n---\nLinks to [[target]].\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nlens: shared\n---\nAlso links to [[target]].\n');
      await execFileAsync('git', ['add', '-A'], { cwd: tmp.root, env });
      await execFileAsync('git', ['commit', '-m', 'add notes'], { cwd: tmp.root, env });

      const archive = await runCli(['archive', 'projects/target.md', '--json'], { cwd: tmp.root, env });
      expect(archive.exitCode).toBe(0);
      const data = JSON.parse(archive.stdout).data;
      expect(data.newPath).toBe('archives/target.md');
      expect(data.linkingNotes.sort()).toEqual(['projects/a.md', 'projects/b.md']);

      await execFileAsync('git', ['commit', '-am', 'archive target'], { cwd: tmp.root, env });
      const log = await execFileAsync('git', ['log', '--follow', '--oneline', '--', 'archives/target.md'], {
        cwd: tmp.root,
        env,
      });
      expect(log.stdout.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2);
    } finally {
      await tmp.cleanup();
    }
  });

  it('archive preserves the visibility field unchanged', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: ctx-a\n---\nContent.\n');
      await execFileAsync('git', ['add', '-A'], { cwd: tmp.root, env });
      await execFileAsync('git', ['commit', '-m', 'add note'], { cwd: tmp.root, env });

      await runCli(['archive', 'projects/a.md', '--json'], { cwd: tmp.root, env });
      const content = await readFile(path.join(tmp.root, 'archives/a.md'), 'utf8');
      expect(content).toContain('lens: ctx-a');
    } finally {
      await tmp.cleanup();
    }
  });

  it('running rollup write twice with no new sources is a no-op producing byte-identical output', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n\nBase content.\n');
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'Rollup text.\n');

      const first = await runCli(['rollup', 'write', 'projects/topic.md', '--content-file', contentFile, '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(first.exitCode).toBe(0);
      const contentBefore = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');

      const second = await runCli(['rollup', 'write', 'projects/topic.md', '--content-file', contentFile, '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(second.exitCode).toBe(0);
      expect(JSON.parse(second.stdout).data.changed).toBe(false);
      const contentAfter = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(contentAfter).toBe(contentBefore);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a fixture with a mismatched fence marker makes rollup write exit non-zero having written zero bytes', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(
        tmp.root,
        'projects/topic.md',
        '# Topic\n\n<!-- >>> contexture:rollup (managed — do not edit) >>> -->\nunpaired\n',
      );
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'New rollup text.\n');

      const before = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      const result = await runCli(['rollup', 'write', 'projects/topic.md', '--content-file', contentFile, '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).not.toBe(0);
      const after = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lint on a store with known orphans and broken links still exits 0', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/orphan.md', '---\nlens: shared\n---\nNo links at all.\n');
      await writeNote(tmp.root, 'projects/broken.md', '---\nlens: shared\n---\nLinks to [[missing-note]].\n');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const result = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.summary.fail).toBeGreaterThan(0);
      expect(
        data.checks.some((c: { id: string; result: string }) => c.id === 'organize.orphan_notes' && c.result === 'fail'),
      ).toBe(true);
      expect(
        data.checks.some((c: { id: string; result: string }) => c.id === 'organize.broken_links' && c.result === 'fail'),
      ).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lint reports uningested inbox material and catalog gaps too, still exiting 0', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      // A capture in the inbox, and — separately — a note the catalog has not
      // caught up with. The capture no longer produces the second finding: it
      // is not a note, so it cannot be a catalog gap.
      await writeNote(tmp.root, 'raw/inbox/raw.md', 'Just captured.\n');
      await writeNote(tmp.root, 'projects/uncatalogued.md', '# Uncatalogued\n');

      const result = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(
        data.checks.some(
          (c: { id: string; result: string }) => c.id === 'organize.uningested_inbox_material' && c.result === 'fail',
        ),
      ).toBe(true);
      expect(
        data.checks.some((c: { id: string; result: string }) => c.id === 'organize.catalog_gaps' && c.result === 'fail'),
      ).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('the generated AGENTS.md documents placement generically from the configured taxonomy, with no hardcoded layer text leaking from code', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init', '--profile', 'zettelkasten'], { cwd: tmp.root, env });
      const content = await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8');
      expect(content).toMatch(/no top-level layers/i);
      expect(content).not.toContain('Projects');
    } finally {
      await tmp.cleanup();
    }
  });
});
