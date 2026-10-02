import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

interface ServedAt {
  area: string;
  route: string;
  url: string | null;
  worktree: string | null;
  after_landing: { route: string; url: string | null } | null;
}

/**
 * The issue this change fixes, end to end: a page scaffolded inside a session
 * worktree is served under the preview route and NOT under the publish one,
 * and the command that made it says so rather than leaving the caller to guess.
 */
describe('publish commands name where the page is served (real CLI)', () => {
  it('names the previewable address of a page made in a session worktree, and it is the address that answers', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const started = await runCli(['--json', 'session', 'start'], { cwd: tmp.root, env });
      expect(started.exitCode).toBe(0);
      const session = (JSON.parse(started.stdout) as { data: { worktree: string } }).data;
      const worktreeName = path.basename(session.worktree);

      // Run from inside the worktree — the write path every page is born on.
      const created = await runCli(['publish', 'new', 'ctx-a/example-page'], { cwd: session.worktree, env });
      expect(created.exitCode).toBe(0);

      const lines = created.stdout.trim().split('\n');
      expect(lines, 'the summary stays one line, so a caller can capture it').toHaveLength(1);
      expect(lines[0]).toContain(`Preview at /preview/${worktreeName}/ctx-a/example-page/index.html`);
      expect(lines[0]).toContain('(at /publish/ctx-a/example-page/index.html once it lands)');

      const checked = await runCli(['--json', 'publish', 'check', '.contexture/publish/ctx-a/example-page/index.html'], {
        cwd: session.worktree,
        env,
      });
      const servedAt = (JSON.parse(checked.stdout) as { data: { served_at: ServedAt } }).data.served_at;
      expect(servedAt.area).toBe('preview');
      expect(servedAt.worktree).toBe(worktreeName);
      expect(servedAt.url).toBeNull();
      expect(servedAt.after_landing?.route).toBe('/publish/ctx-a/example-page/index.html');

      // Serve the store root, the arrangement the reported address assumes.
      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        const reported = await fetch(new URL(servedAt.route, baseUrl));
        expect(reported.status, 'the reported address answers').toBe(200);

        const guessed = await fetch(new URL(servedAt.after_landing!.route, baseUrl));
        expect(guessed.status, 'the published-pages address does not, until the work lands').toBe(404);

        const directory = await fetch(new URL(servedAt.route.replace(/index\.html$/, ''), baseUrl));
        expect(directory.status, 'no directory request is answered, which is why the address names a file').toBe(404);
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 30_000);

  it('names an absolute URL once the store declares a base URL', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await runCli(['publish', 'new', 'ctx-a/example-page'], { cwd: tmp.root, env });

      const { appendFile } = await import('node:fs/promises');
      await appendFile(path.join(tmp.root, 'contexture.yaml'), '\nserve:\n  base_url: https://ctx-a.example.test/ctx-a/\n');

      const checked = await runCli(['--json', 'publish', 'check', '.contexture/publish/ctx-a/example-page/index.html'], {
        cwd: tmp.root,
        env,
      });
      expect(checked.exitCode).toBe(0);
      const servedAt = (JSON.parse(checked.stdout) as { data: { served_at: ServedAt } }).data.served_at;
      expect(servedAt.area).toBe('publish');
      expect(servedAt.url, 'the base URL keeps its own path prefix').toBe(
        'https://ctx-a.example.test/ctx-a/publish/ctx-a/example-page/index.html',
      );
    } finally {
      await tmp.cleanup();
    }
  }, 30_000);
});
