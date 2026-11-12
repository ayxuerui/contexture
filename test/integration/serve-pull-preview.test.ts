import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { BASE_URL, makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const execFileAsync = promisify(execFile);

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function get(url: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });
}

async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return check();
}

async function withServe(store: ApprovalStore, body: (url: string, stderr: () => string) => Promise<void>): Promise<void> {
  const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
  const err: string[] = [];
  child.stderr?.on('data', (c: Buffer) => err.push(c.toString('utf8')));
  try {
    await body((JSON.parse(firstLine) as { data: { url: string } }).data.url, () => err.join(''));
  } finally {
    await stopCliBackground(child);
  }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0x0a, 0x0d, 0x00, 0x01]);

/**
 * A branch pushed from a clone that is not this server's, as a session in
 * another container (or another store's mount) pushes it, with a pull request
 * open for it on the fake forge.
 */
async function pushElsewhere(store: ApprovalStore, branch: string, files: Record<string, string | Buffer>, number: number | null): Promise<{ clone: string; head: string }> {
  const clone = path.join(store.tmp.root, `elsewhere-${branch.replace(/\W/g, '-')}`);
  const git = async (args: string[], cwd = clone) => (await execFileAsync('git', args, { cwd, env: store.env as NodeJS.ProcessEnv })).stdout.trim();
  await git(['clone', '-q', store.origin, clone], store.tmp.root);
  await git(['checkout', '-q', '-b', branch]);
  const head = await commitAndPush(store, clone, branch, files);
  if (number !== null) await store.forge.update((state) => void state.pulls.push({ number, head: branch, title: `Add ${branch}` }));
  return { clone, head };
}

async function commitAndPush(store: ApprovalStore, clone: string, branch: string, files: Record<string, string | Buffer>): Promise<string> {
  const git = async (args: string[]) => (await execFileAsync('git', args, { cwd: clone, env: store.env as NodeJS.ProcessEnv })).stdout.trim();
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(clone, rel)), { recursive: true });
    await writeFile(path.join(clone, rel), content);
  }
  await git(['add', ...Object.keys(files)]);
  await git(['commit', '-q', '--no-verify', '-m', `change ${branch}`]);
  await git(['push', '-q', '--no-verify', 'origin', branch]);
  return git(['rev-parse', 'HEAD']);
}

const PAGE = '.contexture/publish/ctx-a-page';

describe('ctxr serve previews a pull request from its pushed branch (real CLI, fake forge)', { timeout: 90_000 }, () => {
  it('previews a page pushed from elsewhere byte-identical to what /publish/ serves once it lands, then redirects there', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const html = '<!doctype html><title>Ctx-a page</title><p>From another container.</p>\n';
      const { head } = await pushElsewhere(store, 'session/ctx-a-page', { [`${PAGE}/index.html`]: html, [`${PAGE}/logo.png`]: PNG, 'projects/ctx-a-note.md': '# A note\n' }, 7);
      const beforeRefs = await store.git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes']);
      const beforeStatus = await store.git(['status', '--porcelain']);
      await withServe(store, async (url, stderr) => {
        const page = await get(new URL('/preview/pull/7/ctx-a-page/index.html', url).toString());
        expect(page.status, stderr()).toBe(200);
        expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(page.body.toString('utf8')).toBe(html);
        const logo = await get(new URL('/preview/pull/7/ctx-a-page/logo.png', url).toString());
        expect(logo.status).toBe(200);
        expect(Buffer.compare(logo.body, PNG)).toBe(0);

        // Notes stay unaddressable, by name or by climbing out of the publish path.
        expect((await get(new URL('/preview/pull/7/projects/ctx-a-note.md', url).toString())).status).toBe(404);
        expect((await get(new URL('/preview/pull/7/%2e%2e/%2e%2e/projects/ctx-a-note.md', url).toString())).status).toBe(404);
        expect((await get(new URL('/preview/pull/7/ctx-a-page/missing.html', url).toString())).status).toBe(404);

        // The fetch went into the server's own namespace: no branch moved, the working tree is as it was.
        expect(await store.git(['rev-parse', 'refs/ctxr-preview/pull/7'])).toBe(head);
        expect(await store.git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes'])).toBe(beforeRefs);
        expect(await store.git(['status', '--porcelain'])).toBe(beforeStatus);

        // It lands: merged on the forge, and the server's clone brought up to date.
        await store.git(['push', '-q', '--no-verify', store.origin, `${head}:refs/heads/main`]);
        await store.forge.update((state) => {
          const pull = state.pulls.find((p) => p.number === 7)!;
          pull.state = 'closed';
          pull.merged = true;
          (pull as { merged_head_sha?: string }).merged_head_sha = head;
        });
        const synced = await runCli(['sync'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
        expect(synced.exitCode, synced.stdout + synced.stderr).toBe(0);
        const published = await get(new URL('/publish/ctx-a-page/index.html', url).toString());
        expect(published.status).toBe(200);
        expect(Buffer.compare(published.body, page.body)).toBe(0);
        expect(Buffer.compare((await get(new URL('/publish/ctx-a-page/logo.png', url).toString())).body, logo.body)).toBe(0);

        // Once the reuse window has passed, the preview address points to the published page.
        expect(
          await until(async () => (await get(new URL('/preview/pull/7/ctx-a-page/index.html', url).toString())).status === 302, 30_000),
          stderr(),
        ).toBe(true);
        const moved = await get(new URL('/preview/pull/7/ctx-a-page/index.html', url).toString());
        expect(moved.headers.location).toBe(`${BASE_URL}/publish/ctx-a-page/index.html`);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('shows a new push once the head reuse window has passed', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const { clone } = await pushElsewhere(store, 'session/ctx-a-page', { [`${PAGE}/index.html`]: '<p>first</p>\n' }, 7);
      await withServe(store, async (url, stderr) => {
        const address = new URL('/preview/pull/7/ctx-a-page/index.html', url).toString();
        expect((await get(address)).body.toString('utf8'), stderr()).toBe('<p>first</p>\n');
        await commitAndPush(store, clone, 'session/ctx-a-page', { [`${PAGE}/index.html`]: '<p>second</p>\n' });
        // Within the window the head read a moment ago is reused.
        expect((await get(address)).body.toString('utf8')).toBe('<p>first</p>\n');
        expect(await until(async () => (await get(address)).body.toString('utf8') === '<p>second</p>\n', 30_000), stderr()).toBe(true);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('answers 404 for a pull request closed without merging, and for one the forge does not know', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await pushElsewhere(store, 'session/ctx-a-page', { [`${PAGE}/index.html`]: '<p>page</p>\n' }, 7);
      await store.forge.update((state) => void (state.pulls.find((p) => p.number === 7)!.state = 'closed'));
      await withServe(store, async (url) => {
        expect((await get(new URL('/preview/pull/7/ctx-a-page/index.html', url).toString())).status).toBe(404);
        expect((await get(new URL('/preview/pull/99/ctx-a-page/index.html', url).toString())).status).toBe(404);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
