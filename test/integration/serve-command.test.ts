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

const NAV_AREA_ORDER = ['Published pages', 'Notes', 'Catalog', 'Graph'];

function navHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 class="ctxr-nav-heading"><a href="[^"]*">([^<]*)<\/a><\/h2>/g)].map((m) => m[1]!);
}

describe('ctxr serve (real CLI)', () => {
  it('serves notes, catalog, graph, and published pages over loopback only, refusing writes', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      await writeNote(tmp.root, 'projects/a.md', '# A\n\nSee [[b]] and [[nowhere]].\n');
      await writeNote(tmp.root, 'projects/b.md', '# B\n');
      await writeNote(tmp.root, 'projects/deep/nested/c.md', '# C\n');
      await writeNote(tmp.root, 'root-note.md', '# Root\n');
      expect((await runCli(['catalog', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const publishDir = path.join(tmp.root, '.contexture/publish/my-page');
      await mkdir(publishDir, { recursive: true });
      await writeFile(
        path.join(publishDir, 'index.html'),
        '<!doctype html><html><head><title>My Declared Page</title></head><body>Hello, published.</body></html>',
      );
      await writeFile(path.join(publishDir, 'README.md'), '# my-page\n');

      const nestedPublishDir = path.join(tmp.root, '.contexture/publish/folder-a/nested-page');
      await mkdir(nestedPublishDir, { recursive: true });
      await writeFile(path.join(nestedPublishDir, 'index.html'), '<!doctype html><html><body>Nested.</body></html>');

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string; port: number; root: string } };
        expect(envelope.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(envelope.data.port).toBeGreaterThan(0);
        const baseUrl = envelope.data.url;

        const indexRes = await fetch(baseUrl);
        expect(indexRes.status).toBe(200);
        const indexHtml = await indexRes.text();
        expect(navHeadings(indexHtml)).toEqual(NAV_AREA_ORDER);
        expect([...indexHtml.matchAll(/<h2 id="[^"]*">([^<]*)<\/h2>/g)].map((m) => m[1]!)).toEqual(NAV_AREA_ORDER);
        // Notes are grouped by folder, not listed as whole paths.
        expect(indexHtml).toContain('<summary>projects</summary>');
        expect(indexHtml).toContain('<summary>nested</summary>');
        expect(indexHtml).toContain('<a href="/notes/projects/deep/nested/c.md">c</a>');
        expect(indexHtml).toContain('<a href="/notes/root-note.md">root-note</a>');
        expect(indexHtml).not.toContain('>projects/a.md<');
        // A nested published page is addressed at its full path.
        expect(indexHtml).toContain('<a href="/publish/folder-a/nested-page/index.html">nested-page</a>');
        // A page's nav label follows its own declared <title>, not its directory segment.
        expect(indexHtml).toContain('<a href="/publish/my-page/index.html">My Declared Page</a>');
        expect(indexHtml).not.toContain('>my-page<');
        expect(indexHtml).not.toContain('<script');

        const styleRes = await fetch(new URL('/assets/style.css', baseUrl));
        expect(styleRes.status).toBe(200);
        expect(styleRes.headers.get('content-type')).toContain('text/css');

        const noteRes = await fetch(new URL('/notes/projects/a.md', baseUrl));
        expect(noteRes.status).toBe(200);
        const noteHtml = await noteRes.text();
        expect(noteHtml).toContain('<a href="/notes/projects/b.md">b</a>');
        expect(noteHtml).toContain('class="ctxr-broken-link"');
        expect(noteHtml).toContain('data-reason="not_found"');
        // The navigation is a property of the shell, so a note page carries it too.
        expect(navHeadings(noteHtml)).toEqual(NAV_AREA_ORDER);
        expect(noteHtml).toContain('<a href="/notes/projects/deep/nested/c.md">c</a>');

        const missingNoteRes = await fetch(new URL('/notes/projects/does-not-exist.md', baseUrl));
        expect(missingNoteRes.status).toBe(404);

        const excludedRes = await fetch(new URL('/notes/contexture.yaml', baseUrl));
        expect(excludedRes.status).toBe(404);

        const catalogRes = await fetch(new URL('/catalog/projects', baseUrl));
        expect(catalogRes.status).toBe(200);
        const catalogHtml = await catalogRes.text();
        expect(catalogHtml).toContain('<a href="/notes/projects/a.md">');
        expect(navHeadings(catalogHtml)).toEqual(NAV_AREA_ORDER);

        const graphRes = await fetch(new URL('/graph', baseUrl));
        expect(graphRes.status).toBe(200);
        expect(navHeadings(await graphRes.text())).toEqual(NAV_AREA_ORDER);

        const publishRes = await fetch(new URL('/publish/my-page/index.html', baseUrl));
        expect(publishRes.status).toBe(200);
        expect(await publishRes.text()).toBe(
          '<!doctype html><html><head><title>My Declared Page</title></head><body>Hello, published.</body></html>',
        );

        const nestedPublishRes = await fetch(new URL('/publish/folder-a/nested-page/index.html', baseUrl));
        expect(nestedPublishRes.status).toBe(200);
        expect(await nestedPublishRes.text()).toBe('<!doctype html><html><body>Nested.</body></html>');

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

  it('binds to an explicit --host instead of the loopback default', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--host', '0.0.0.0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string; host: string; port: number } };
        expect(envelope.data.host).toBe('0.0.0.0');
        expect(envelope.data.url).toMatch(/^http:\/\/0\.0\.0\.0:\d+\/$/);

        // 0.0.0.0 accepts connections on every interface, loopback included.
        const res = await fetch(`http://127.0.0.1:${envelope.data.port}/`);
        expect(res.status).toBe(200);
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);

  it('resolves and persists the display theme without any route of its own', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const publishDir = path.join(tmp.root, '.contexture/publish/my-page');
      await mkdir(publishDir, { recursive: true });
      await writeFile(path.join(publishDir, 'index.html'), '<!doctype html><html><body>Hello.</body></html>');

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string } };
        const baseUrl = envelope.data.url;

        // No cookie, no query parameter: follows the system.
        const defaultRes = await fetch(baseUrl);
        expect(await defaultRes.text()).toContain('data-ctxr-theme="system"');

        // A query parameter sets the cookie and takes effect on the same response.
        const chooseRes = await fetch(new URL('/?ctxr-theme=dark', baseUrl));
        expect(chooseRes.status).toBe(200);
        const setCookie = chooseRes.headers.get('set-cookie') ?? '';
        expect(setCookie).toContain('ctxr_theme=dark');
        expect(setCookie).toContain('SameSite=Lax');
        expect(setCookie).toContain('HttpOnly');
        expect(chooseRes.headers.get('vary')).toContain('Cookie');
        expect(chooseRes.headers.get('cache-control')).toContain('no-store');
        expect(await chooseRes.text()).toContain('data-ctxr-theme="dark"');

        // The cookie alone, with no query parameter, persists the choice on the next page.
        const persistedRes = await fetch(new URL('/graph', baseUrl), { headers: { cookie: 'ctxr_theme=dark' } });
        expect(await persistedRes.text()).toContain('data-ctxr-theme="dark"');

        // An unrecognized cookie value falls back to following the system, not to an error.
        const bogusRes = await fetch(baseUrl, { headers: { cookie: 'ctxr_theme=bogus' } });
        expect(bogusRes.status).toBe(200);
        expect(await bogusRes.text()).toContain('data-ctxr-theme="system"');

        // HEAD still persists the choice, and still sends no body.
        const headRes = await fetch(new URL('/?ctxr-theme=light', baseUrl), { method: 'HEAD' });
        expect(headRes.status).toBe(200);
        expect(headRes.headers.get('set-cookie') ?? '').toContain('ctxr_theme=light');
        expect(await headRes.text()).toBe('');

        // A published page is served byte-verbatim: no cookie, no theme attribute, no navigation.
        const publishRes = await fetch(new URL('/publish/my-page/index.html?ctxr-theme=dark', baseUrl));
        expect(publishRes.status).toBe(200);
        expect(publishRes.headers.get('set-cookie')).toBeNull();
        expect(await publishRes.text()).toBe('<!doctype html><html><body>Hello.</body></html>');
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);

  it('shows and hides the navigation without client-side script', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string } };
        const baseUrl = envelope.data.url;

        const defaultRes = await fetch(baseUrl);
        const defaultHtml = await defaultRes.text();
        expect(defaultHtml).toContain('data-ctxr-nav="shown"');
        expect(defaultHtml).not.toContain('<script');

        const collapseRes = await fetch(new URL('/?ctxr-nav=collapsed', baseUrl));
        expect(collapseRes.headers.get('set-cookie') ?? '').toContain('ctxr_nav=collapsed');
        expect(await collapseRes.text()).toContain('data-ctxr-nav="collapsed"');

        // The collapsed choice persists across navigation via the cookie, with no query parameter.
        const persistedRes = await fetch(new URL('/graph', baseUrl), { headers: { cookie: 'ctxr_nav=collapsed' } });
        expect(await persistedRes.text()).toContain('data-ctxr-nav="collapsed"');

        const showRes = await fetch(new URL('/?ctxr-nav=shown', baseUrl), { headers: { cookie: 'ctxr_nav=collapsed' } });
        expect(await showRes.text()).toContain('data-ctxr-nav="shown"');
      } finally {
        await stopCliBackground(child);
      }
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
