import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('ctxr serve (real CLI)', () => {
  it('serves notes, catalog, graph, and published pages over loopback only, refusing writes', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      await writeNote(tmp.root, 'projects/a.md', '# A\n\nSee [[b]] and [[nowhere]].\n');
      await writeNote(tmp.root, 'projects/b.md', '# B\n');
      expect((await runCli(['catalog', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const publishDir = path.join(tmp.root, '.contexture/publish/my-page');
      await mkdir(publishDir, { recursive: true });
      await writeFile(path.join(publishDir, 'index.html'), '<!doctype html><html><body>Hello, published.</body></html>');
      await writeFile(path.join(publishDir, 'README.md'), '# my-page\n');

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string; port: number; root: string } };
        expect(envelope.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(envelope.data.port).toBeGreaterThan(0);
        const baseUrl = envelope.data.url;

        const indexRes = await fetch(baseUrl);
        expect(indexRes.status).toBe(200);
        expect(await indexRes.text()).toContain('projects/a.md');

        const noteRes = await fetch(new URL('/notes/projects/a.md', baseUrl));
        expect(noteRes.status).toBe(200);
        const noteHtml = await noteRes.text();
        expect(noteHtml).toContain('<a href="/notes/projects/b.md">b</a>');
        expect(noteHtml).toContain('class="ctxr-broken-link"');
        expect(noteHtml).toContain('data-reason="not_found"');

        const missingNoteRes = await fetch(new URL('/notes/projects/does-not-exist.md', baseUrl));
        expect(missingNoteRes.status).toBe(404);

        const excludedRes = await fetch(new URL('/notes/contexture.yaml', baseUrl));
        expect(excludedRes.status).toBe(404);

        const catalogRes = await fetch(new URL('/catalog/projects', baseUrl));
        expect(catalogRes.status).toBe(200);
        expect(await catalogRes.text()).toContain('<a href="/notes/projects/a.md">');

        const graphRes = await fetch(new URL('/graph', baseUrl));
        expect(graphRes.status).toBe(200);

        const publishRes = await fetch(new URL('/publish/my-page/index.html', baseUrl));
        expect(publishRes.status).toBe(200);
        expect(await publishRes.text()).toBe('<!doctype html><html><body>Hello, published.</body></html>');

        const postRes = await fetch(baseUrl, { method: 'POST' });
        expect(postRes.status).toBe(405);
      } finally {
        await stopCliBackground(child);
      }
      expect(child.exitCode === null ? child.signalCode : child.exitCode).not.toBeNull();
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);

  it('shows a build hint instead of a bare 404 when the graph has not been built yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string } };
        const graphRes = await fetch(new URL('/graph', envelope.data.url));
        expect(graphRes.status).toBe(200);
        expect(await graphRes.text()).toContain('ctxr graph build');
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);
});
