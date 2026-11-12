import { execFile } from 'node:child_process';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

const NAV_AREA_ORDER = ['Published pages', 'Preview', 'Notes', 'Catalog', 'Graph'];

/** Runs git directly; `runCli` always spawns the built CLI and has no bin override. */
const git = async (args: readonly string[], cwd: string, env: Record<string, string | undefined>): Promise<void> => {
  await promisify(execFile)('git', [...args], { cwd, env: env as NodeJS.ProcessEnv });
};

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
        // Notes are grouped by folder, not listed as whole paths. A group matching a
        // configured taxonomy layer's path carries that layer's declared name; a group
        // matching none keeps its bare directory segment.
        expect(indexHtml).toContain('<summary>Projects</summary>');
        expect(indexHtml).not.toContain('<summary>projects</summary>');
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

describe('ctxr serve preview of a session worktree (real CLI)', () => {
  it('serves a page that exists only in a session worktree, byte-verbatim, and nothing else from it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      // A landed page, so the two areas can be told apart in one response.
      await writeNote(tmp.root, '.contexture/publish/landed-page/index.html', '<!doctype html><title>Landed Page</title>');

      // A real linked worktree, made by the command that makes them.
      const started = await runCli(['--json', 'session', 'start'], { cwd: tmp.root, env });
      expect(started.exitCode).toBe(0);
      const session = (JSON.parse(started.stdout) as { data: { worktree: string; branch: string } }).data;
      const worktree = session.worktree;
      const worktreeName = path.basename(worktree);
      expect(worktreeName).toBe(session.branch.replace(/\//g, '-'));

      // Put a page in the worktree the store root has never seen.
      const draft = '<!doctype html><html><head><title>Still Drafting</title></head><body>Draft body.</body></html>';
      await writeNote(worktree, '.contexture/publish/ctx-a/draft-page/index.html', draft);
      await writeNote(worktree, '.contexture/publish/ctx-a/draft-page/README.md', '# draft-page\n');
      await writeNote(worktree, 'projects/worktree-only-note.md', '# Worktree Only\n');

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { url: string } };
        const baseUrl = envelope.data.url;
        const previewUrl = `${baseUrl}preview/${worktreeName}/ctx-a/draft-page/index.html`;

        // The page is reachable, and byte-identical to the file on disk.
        const pageRes = await fetch(previewUrl);
        expect(pageRes.status).toBe(200);
        expect(await pageRes.text()).toBe(draft);

        // It is NOT reachable on the publish route — the two areas stay separate.
        expect((await fetch(`${baseUrl}publish/ctx-a/draft-page/index.html`)).status).toBe(404);

        // The navigation names the area, groups by worktree, and uses the declared title.
        const indexHtml = await (await fetch(baseUrl)).text();
        expect(navHeadings(indexHtml)).toEqual(NAV_AREA_ORDER);
        expect(indexHtml).toContain(`<summary>${worktreeName}</summary>`);
        expect(indexHtml).toContain('>Still Drafting</a>');
        expect(indexHtml).toContain(`href="/preview/${worktreeName}/ctx-a/draft-page/index.html"`);
        expect(indexHtml).toContain('>Landed Page</a>');

        // An unknown worktree, and a bare worktree segment, are ordinary misses.
        expect((await fetch(`${baseUrl}preview/session-nope/ctx-a/draft-page/index.html`)).status).toBe(404);
        expect((await fetch(`${baseUrl}preview/${worktreeName}`)).status).toBe(404);

        // The map miss is the traversal guard: nothing outside the worktree's
        // publish path is reachable, however the path is spelled. The escapes
        // below encode the SEPARATOR rather than the dots — `..` and `%2e%2e`
        // are both normalized away by WHATWG URL parsing before the handler
        // ever sees them, so only `..%2f` actually reaches it as a dot segment
        // and only it tests the guard rather than the URL parser.
        for (const escape of [
          `preview/${worktreeName}/..%2f..%2fcontexture.yaml`,
          `preview/${worktreeName}/..%2f..%2f..%2fcontexture.yaml`,
          `preview/${worktreeName}/..%2fprojects%2fworktree-only-note.md`,
        ]) {
          const res = await fetch(`${baseUrl}${escape}`);
          expect(res.status, escape).toBe(404);
          expect(await res.text(), escape).not.toContain('schema_version');
        }

        // Published pages only: a note living in the worktree stays unreachable
        // on both the preview route and the note route.
        expect((await fetch(`${baseUrl}preview/${worktreeName}/projects/worktree-only-note.md`)).status).toBe(404);
        expect((await fetch(`${baseUrl}notes/.worktrees/${worktreeName}/projects/worktree-only-note.md`)).status).toBe(404);
        expect(indexHtml).not.toContain('Worktree Only');

        // The route consults no commit, push, or review state: the page above was
        // never committed, and committing it changes nothing about the response.
        await git(['add', '-A'], worktree, env);
        await git(['commit', '-m', 'wip'], worktree, env);
        const afterCommit = await fetch(previewUrl);
        expect(afterCommit.status).toBe(200);
        expect(await afterCommit.text()).toBe(draft);
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 30_000);
});

/** Runs git and returns its stdout. */
const gitOut = async (args: readonly string[], cwd: string, env: Record<string, string | undefined>): Promise<string> =>
  (await promisify(execFile)('git', [...args], { cwd, env: env as NodeJS.ProcessEnv })).stdout;

interface DiffJson {
  base: string;
  head: string;
  counts: Record<string, number>;
  notes: { added: string[]; removed: string[]; modified: string[]; moved: { from: string; to: string }[]; archived: { from: string; to: string }[] };
  links: { added: { src: string; dst: string; type: string }[]; removed: { src: string; dst: string; type: string }[] };
  dangling: { introduced: { from: string; target: string }[] };
}

const COUNT_LABELS: Readonly<Record<string, string>> = {
  notes_added: 'Notes added',
  notes_removed: 'Notes removed',
  notes_modified: 'Notes modified',
  notes_moved: 'Notes moved',
  notes_archived: 'Notes archived',
  links_added: 'Links added',
  links_removed: 'Links removed',
  dangling_introduced: 'Dangling links introduced',
  dangling_resolved: 'Dangling links resolved',
  inbound_changed: 'Notes whose inbound links changed',
  rollups_touched: 'Rollups touched',
  sources_cited: 'Notes citing new sources',
};

describe('ctxr serve send copies (real CLI) — send-copies-beside-their-page', () => {
  it('serves each send copy with its format\'s content type, byte-verbatim, on the publish and preview routes alike', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);

      // Bytes that are not valid UTF-8, so a text decode anywhere on the way out would show.
      const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a]);
      await writeNote(tmp.root, '.contexture/publish/ctx-a/brief/index.html', '<!doctype html><title>Brief</title>');
      await writeFile(path.join(tmp.root, '.contexture/publish/ctx-a/brief/2026-01-15-brief.pdf'), pdf);
      await writeFile(path.join(tmp.root, '.contexture/publish/ctx-a/brief/2026-01-15-model.xlsx'), pdf);

      const started = await runCli(['--json', 'session', 'start'], { cwd: tmp.root, env });
      expect(started.exitCode).toBe(0);
      const worktree = (JSON.parse(started.stdout) as { data: { worktree: string } }).data.worktree;
      const worktreeName = path.basename(worktree);
      await writeNote(worktree, '.contexture/publish/ctx-a/draft/index.html', '<!doctype html><title>Draft</title>');
      await writeFile(path.join(worktree, '.contexture/publish/ctx-a/draft/2026-03-02-draft.pdf'), pdf);
      await writeFile(path.join(worktree, '.contexture/publish/ctx-a/draft/2026-03-02-draft.docx'), pdf);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        const cases: [string, string][] = [
          ['publish/ctx-a/brief/2026-01-15-brief.pdf', 'application/pdf'],
          ['publish/ctx-a/brief/2026-01-15-model.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          [`preview/${worktreeName}/ctx-a/draft/2026-03-02-draft.pdf`, 'application/pdf'],
          [`preview/${worktreeName}/ctx-a/draft/2026-03-02-draft.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ];
        for (const [route, contentType] of cases) {
          const res = await fetch(`${baseUrl}${route}`);
          expect(res.status).toBe(200);
          expect(res.headers.get('content-type')).toBe(contentType);
          expect(Buffer.from(await res.arrayBuffer()).equals(pdf)).toBe(true);
        }
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('ctxr serve review view of a session worktree (real CLI)', () => {
  it('renders the same facts graph diff reports, derived from the delta alone, and touches nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await writeNote(tmp.root, 'projects/keep.md', '# Keep\n');
      await writeNote(tmp.root, 'projects/done.md', '# Done\n\nFinished work, kept for the record.\n');
      await git(['add', '-A'], tmp.root, env);
      await git(['commit', '-q', '--no-verify', '-m', 'notes'], tmp.root, env);

      const start = async (): Promise<string> => {
        const started = await runCli(['--json', 'session', 'start'], { cwd: tmp.root, env });
        expect(started.exitCode).toBe(0);
        return (JSON.parse(started.stdout) as { data: { worktree: string } }).data.worktree;
      };
      const worktree = await start();
      const name = path.basename(worktree);
      const quiet = await start();
      const quietName = path.basename(quiet);

      await writeNote(worktree, 'projects/worktree-only-note.md', '# Worktree Only\n\n[[keep]] and [[nowhere-yet]]\n');
      expect((await runCli(['archive', 'projects/done.md'], { cwd: worktree, env })).exitCode).toBe(0);
      await git(['add', '-A'], worktree, env);
      await git(['commit', '-q', '--no-verify', '-m', 'Added projects/phantom-claim.md and rewrote everything'], worktree, env);
      const h1 = (await gitOut(['rev-parse', 'HEAD'], worktree, env)).trim();

      // Uncommitted work: in neither the command's report nor the view.
      await writeNote(worktree, 'projects/uncommitted.md', '# Uncommitted\n');

      const defaultBranch = (await gitOut(['symbolic-ref', '--short', 'HEAD'], tmp.root, env)).trim();
      const report = await runCli(['--json', 'graph', 'diff', '--since', defaultBranch], { cwd: worktree, env });
      expect(report.exitCode, report.stdout + report.stderr).toBe(0);
      const delta = (JSON.parse(report.stdout) as { data: DiffJson }).data;
      expect(delta.head).toBe(h1);
      expect(delta.notes.added).toEqual(['projects/worktree-only-note.md']);
      expect(delta.notes.archived).toHaveLength(1);
      const archived = delta.notes.archived[0]!;
      expect(archived.from).toBe('projects/done.md');
      expect(archived.to).toMatch(/\/projects\/done\.md$/);

      const statusBefore = await gitOut(['status', '--porcelain'], worktree, env);
      const cacheListing = async (): Promise<string[]> => readdir(path.join(worktree, '.contexture/cache')).catch(() => []);
      const cacheBefore = await cacheListing();
      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        const res = await fetch(`${baseUrl}review/${name}/`);
        expect(res.status).toBe(200);
        const html = await res.text();

        // The same facts as the command, and both full ids.
        expect(html).toContain(delta.base);
        expect(html).toContain(delta.head);
        for (const [key, count] of Object.entries(delta.counts)) {
          expect(html, key).toContain(`<td>${COUNT_LABELS[key]}</td>\n<td>${count}</td>`);
        }
        expect(html).toContain('<code>projects/worktree-only-note.md</code>');
        expect(html).toContain('<code>projects/done.md</code>');
        expect(html).toContain(`<code>${archived.to}</code>`);
        expect(html).toContain('<code>nowhere-yet</code>');
        // Every edge the diagram draws is also in the tables. render-diagrams-in-notes: the
        // block is marked for the renderer, and its source stays readable without script.
        expect(html).toContain('<pre class="ctxr-diagram"><code>');
        for (const edge of delta.links.added) {
          expect(html).toMatch(new RegExp(`<td>(?:<a [^>]*>)?<code>${edge.src}</code>(?:</a>)?</td>\\n<td>(?:<a [^>]*>)?<code>${edge.dst}</code>`));
        }

        // A worktree-only note is text, not a link, and the note route still refuses it.
        expect(html).not.toContain('href="/notes/projects/worktree-only-note.md"');
        expect(html).toContain('<a href="/notes/projects/keep.md"><code>projects/keep.md</code></a>');
        expect((await fetch(`${baseUrl}notes/projects/worktree-only-note.md`)).status).toBe(404);

        // Nothing an agent wrote, and nothing uncommitted.
        expect(html).not.toContain('phantom-claim');
        expect(html).not.toContain('uncommitted.md');

        // The shell: navigation and theme. The only scripts are the local diagram renderer and
        // page script, which only enhance: every fact above is in the server-rendered HTML.
        expect(navHeadings(html)).toEqual(NAV_AREA_ORDER);
        expect(html).toContain('data-ctxr-theme="system"');
        expect(html).toContain('href="?ctxr-theme=dark"');
        for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)) {
          expect(src).toMatch(/^\/assets\/(?:mermaid\/[^/]+\/mermaid\.tiny\.js|diagrams\.mjs)$/);
        }
        expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);

        // A recorded head that is current gives no notice.
        const current = await (await fetch(`${baseUrl}review/${name}/?head=${h1}`)).text();
        expect(current).not.toContain('ctxr-review-moved');

        // The branch moves on: the notice names both, and the view shows the new head.
        await writeNote(worktree, 'projects/second.md', '# Second\n');
        await git(['add', 'projects/second.md'], worktree, env);
        await git(['commit', '-q', '--no-verify', '-m', 'second'], worktree, env);
        const h2 = (await gitOut(['rev-parse', 'HEAD'], worktree, env)).trim();
        const moved = await (await fetch(`${baseUrl}review/${name}/?head=${h1}`)).text();
        expect(moved).toContain('ctxr-review-moved');
        expect(moved).toContain(
          `<p class="ctxr-review-moved">The branch has moved past the recorded head <code>${h1}</code>. This view shows the current head <code>${h2}</code>.</p>`,
        );
        expect(moved).toContain('<code>projects/second.md</code>');

        // A worktree with no knowledge changes says so; an unknown one is refused.
        const quietRes = await fetch(`${baseUrl}review/${quietName}/`);
        expect(quietRes.status).toBe(200);
        expect(await quietRes.text()).toContain('No knowledge changes');
        expect((await fetch(`${baseUrl}review/session-nope/`)).status).toBe(404);
        expect((await fetch(`${baseUrl}review/${name}/..%2f..%2fcontexture.yaml`)).status).toBe(404);

        // Serving the view changed nothing in the worktree, cache included.
        const statusAfter = await gitOut(['status', '--porcelain'], worktree, env);
        expect(statusAfter).toBe(statusBefore);
        expect(statusAfter).toContain('projects/uncommitted.md');
        expect(await cacheListing()).toEqual(cacheBefore);
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 60_000);
});

/** render-diagrams-in-notes: the scenarios a real server and real HTTP can check, short of a browser. */
describe('ctxr serve diagrams (real CLI)', () => {
  const DIAGRAM = '```mermaid\nflowchart LR\n  A["<b>start</b> & go"] --> B\n```\n';
  const ESCAPED_SOURCE = 'flowchart LR\n  A[&quot;&lt;b&gt;start&lt;/b&gt; &amp; go&quot;] --&gt; B\n';

  const requireFromTest = createRequire(import.meta.url);
  const rendererFile = requireFromTest.resolve('@mermaid-js/tiny');
  const rendererVersion = (requireFromTest('@mermaid-js/tiny/package.json') as { version: string }).version;
  const rendererRoute = `/assets/mermaid/${rendererVersion}/mermaid.tiny.js`;

  function expectDiagramPage(html: string, label: string): void {
    expect(html, label).toContain(`<pre class="ctxr-diagram"><code>${ESCAPED_SOURCE}</code></pre>`);
    expect(html, label).toContain(`<script defer src="${rendererRoute}"></script><script type="module" src="/assets/diagrams.mjs"></script>`);
    for (const [, url] of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
      expect(url, `${label}: ${url}`).not.toMatch(/^https?:/);
    }
  }

  it('renders mermaid blocks as marked source with local scripts, only where a diagram is', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await writeNote(tmp.root, 'projects/diagram.md', `# Diagram\n\n${DIAGRAM}`);
      await writeNote(tmp.root, 'projects/plain.md', '# Plain\n\n```dot\ndigraph { a -> b }\n```\n');
      expect((await runCli(['catalog', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await runCli(['graph', 'build'], { cwd: tmp.root, env })).exitCode).toBe(0);
      // Derived documents are served from disk as they stand, so a block written into them takes the same route.
      await writeFile(path.join(tmp.root, '.contexture/catalog/projects.md'), `# Projects\n\n${DIAGRAM}`);
      await writeFile(path.join(tmp.root, '.contexture/cache/graph.md'), `# Graph\n\n${DIAGRAM}`);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        const get = async (route: string, init?: RequestInit) => fetch(new URL(route, baseUrl), init);

        expectDiagramPage(await (await get('/notes/projects/diagram.md')).text(), 'note');
        expectDiagramPage(await (await get('/catalog/projects')).text(), 'catalog');
        expectDiagramPage(await (await get('/graph')).text(), 'graph');

        const plainHtml = await (await get('/notes/projects/plain.md')).text();
        expect(plainHtml).toContain('<pre><code class="language-dot">');
        expect(plainHtml).not.toContain('<script');
        expect(plainHtml).not.toContain('ctxr-diagram');
        expect(await (await get('/')).text()).not.toContain('<script');

        // Theme and navigation choices behave on a diagram page exactly as on a page without one.
        const htmlTag = (html: string) => /<html [^>]*>/.exec(html)?.[0];
        for (const query of ['?ctxr-theme=dark', '?ctxr-nav=collapsed']) {
          const withDiagram = await get(`/notes/projects/diagram.md${query}`);
          const without = await get(`/notes/projects/plain.md${query}`);
          expect(withDiagram.headers.get('set-cookie'), query).not.toBeNull();
          expect(withDiagram.headers.get('set-cookie'), query).toBe(without.headers.get('set-cookie'));
          expect(htmlTag(await withDiagram.text()), query).toBe(htmlTag(await without.text()));
        }
        const persisted = await (await get('/notes/projects/diagram.md', { headers: { cookie: 'ctxr_theme=dark; ctxr_nav=collapsed' } })).text();
        expect(persisted).toContain('data-ctxr-theme="dark"');
        expect(persisted).toContain('data-ctxr-nav="collapsed"');
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);

  it('serves the renderer from the installed package and the page script, without reading the store', async () => {
    const tmp = await makeTmpDir();
    const unreadable = path.join(tmp.root, 'projects');
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await writeNote(tmp.root, 'projects/a.md', '# A\n');

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        // A notes directory the server cannot read: the asset routes must not need to.
        await chmod(unreadable, 0o000);
        // Anti-vacuity: a route that does read the store fails on it.
        expect((await fetch(baseUrl)).status).toBe(500);

        const rendererRes = await fetch(new URL(rendererRoute, baseUrl));
        expect(rendererRes.status).toBe(200);
        expect(rendererRes.headers.get('content-type')).toContain('text/javascript');
        expect(rendererRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(Buffer.from(await rendererRes.arrayBuffer()).equals(await readFile(rendererFile))).toBe(true);

        const scriptRes = await fetch(new URL('/assets/diagrams.mjs', baseUrl));
        expect(scriptRes.status).toBe(200);
        expect(scriptRes.headers.get('content-type')).toContain('text/javascript');
        expect(scriptRes.headers.get('cache-control')).toBeNull();
        expect(await scriptRes.text()).toContain('export function effectiveScheme');

        expect((await fetch(new URL('/assets/mermaid/0.0.0-not-installed/mermaid.tiny.js', baseUrl))).status).toBe(404);
        expect((await fetch(new URL(`/assets/mermaid/${rendererVersion}/other.js`, baseUrl))).status).toBe(404);
      } finally {
        await chmod(unreadable, 0o755);
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 20_000);

  it('serves a published page and a preview page carrying a mermaid block byte-verbatim', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const page = `<!doctype html><html><head><title>Diagram Page</title></head><body><pre>\n${DIAGRAM}</pre></body></html>`;
      await writeNote(tmp.root, '.contexture/publish/diagram-page/index.html', page);

      const started = await runCli(['--json', 'session', 'start'], { cwd: tmp.root, env });
      expect(started.exitCode).toBe(0);
      const worktree = (JSON.parse(started.stdout) as { data: { worktree: string } }).data.worktree;
      await writeNote(worktree, '.contexture/publish/ctx-a/draft/index.html', page);

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: tmp.root, env });
      try {
        const baseUrl = (JSON.parse(firstLine) as { data: { url: string } }).data.url;
        for (const route of ['publish/diagram-page/index.html', `preview/${path.basename(worktree)}/ctx-a/draft/index.html`]) {
          const res = await fetch(`${baseUrl}${route}`);
          expect(res.status, route).toBe(200);
          const body = await res.text();
          expect(body, route).toBe(page);
          expect(body, route).not.toContain('ctxr-diagram');
          expect(body, route).not.toContain('<script');
        }
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await tmp.cleanup();
    }
  }, 30_000);
});
