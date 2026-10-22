import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorktrees } from '../../src/core/git/worktree.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { makeMcpWriteFixture, MEMBER, type McpWriteFixture } from '../helpers/mcp-write.js';

interface Captured {
  saved: boolean;
  resumed: boolean;
  path: string;
  source_id: string;
  pull_request: { number: number };
  approval_url: string;
}

describe('mcp capture through the approval page', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const capture = (args: Record<string, unknown>) => f.call('capture', { title: 'Pricing call', body: 'We agreed on two tiers.\n', source_type: 'meeting', ...args }) as Promise<unknown> as Promise<Captured>;
  const sessions = async () => (await listWorktrees(createExecFileGitRunner(), f.store.root)).filter((w) => w.branch?.startsWith('session/'));

  it('opens a session pull request with one inbox file, authored by the member, leaving main alone', async () => {
    const mainBefore = await f.store.git(['ls-remote', 'origin', 'refs/heads/main']);
    const result = await capture({});
    expect(result).toMatchObject({ saved: true, resumed: false, source_id: expect.stringMatching(/^meeting\/[0-9a-f]{16}$/) });
    expect(result.path).toMatch(/^raw\/inbox\/2026-01-01-pricing-call-[0-9a-f]{6}\.md$/);

    const pulls = (await f.store.forge.read()).pulls;
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ number: result.pull_request.number, state: 'open', title: 'Capture: Pricing call', base: 'main' });
    const branch = pulls[0]!.head;
    expect(await f.store.git(['diff', '--name-status', `origin/main...origin/${branch}`])).toBe(`A\t${result.path}`);
    expect(await f.store.git(['log', '-1', '--format=%ae%n%B', `origin/${branch}`])).toContain(`${MEMBER}\nCapture: Pricing call\n\nCaptured-by: ${MEMBER}`);
    const text = await f.store.git(['show', `origin/${branch}:${result.path}`]);
    expect(text).toContain('source_type: meeting');
    expect(text).toContain('We agreed on two tiers.');
    expect(await f.store.git(['ls-remote', 'origin', 'refs/heads/main'])).toBe(mainBefore);
    expect(result.approval_url).toBe(`https://ctx-a.example.test/approve/${encodeURIComponent(path.basename((await sessions())[0]!.path))}`);
  });

  it('refuses material already in the store, and material awaiting approval, creating nothing', async () => {
    await f.store.advanceMain({ 'raw/inbox/2026-01-01-old.md': '---\nsource_type: email\nsource_id: email/42\n---\nold\n' });
    f.tick(61);
    await expect(capture({ source_type: 'email', source_id: 'email/42' })).rejects.toMatchObject({ code: 'mcp.already_captured' });
    expect((await f.store.forge.read()).pulls).toHaveLength(0);

    await capture({ source_id: 'meeting/7' });
    await expect(capture({ source_id: 'meeting/7', title: 'Again' })).rejects.toMatchObject({ code: 'mcp.already_captured', message: expect.stringContaining('awaiting approval') });
    expect((await f.store.forge.read()).pulls).toHaveLength(1);
    expect(await sessions()).toHaveLength(1);
  });

  it('gives the same material the same identity, so a repeat is a duplicate', async () => {
    const first = await capture({});
    await expect(capture({ title: 'Different title, same material' })).rejects.toMatchObject({ code: 'mcp.already_captured' });
    expect(first.source_id).toMatch(/^meeting\//);
  });

  it('refuses a body missing the section the store requires, writing nothing', async () => {
    const configPath = path.join(f.store.root, 'contexture.yaml');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace(/^ingest:\n/m, 'ingest:\n  required_capture_sections: { meeting: Transcript }\n').replace(/^(?!ingest:)([\s\S]*)$/, (s) => (s.includes('required_capture_sections') ? s : `${s}ingest:\n  required_capture_sections: { meeting: Transcript }\n`)));
    await f.store.git(['commit', '-qam', 'require transcripts', '--no-verify']);
    await f.store.git(['push', '-q', '--no-verify', 'origin', 'main']);
    f.tick(61);
    await expect(capture({})).rejects.toMatchObject({ code: 'mcp.required_section_missing' });
    expect(await sessions()).toHaveLength(0);
    const ok = await capture({ body: '## Transcript\n\nA: two tiers.\n' });
    expect(ok.saved).toBe(true);
  });

  it('produces one pull request when two captures of one source arrive at once', async () => {
    const results = await Promise.allSettled([capture({ source_id: 'meeting/9' }), capture({ source_id: 'meeting/9' })]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await f.store.forge.read()).pulls).toHaveLength(1);
  });

  it('resumes after a failed push and after a failed pull request, into exactly one pull request', async () => {
    await f.store.git(['remote', 'set-url', '--push', 'origin', path.join(f.store.tmp.root, 'nowhere.git')]);
    await expect(capture({ source_id: 'meeting/11' })).rejects.toMatchObject({ code: 'mcp.push_failed' });
    await f.store.git(['remote', 'set-url', '--push', 'origin', f.store.origin]);
    await f.store.forge.update((state) => {
      state.failCreatePull = 1;
    });
    await expect(capture({ source_id: 'meeting/11' })).rejects.toMatchObject({ code: 'mcp.pull_request_failed' });
    const resumed = await capture({ source_id: 'meeting/11' });
    expect(resumed.resumed).toBe(true);
    expect((await f.store.forge.read()).pulls).toHaveLength(1);
    expect(await sessions()).toHaveLength(1);
    const branch = (await f.store.forge.read()).pulls[0]!.head;
    expect(await f.store.git(['rev-list', '--count', `origin/main..origin/${branch}`])).toBe('1');
  });

  // design.md D9: an open pull request already carrying the identity is named, never duplicated. The server cannot
  // tell the caller's own retry from someone else capturing the same material, so it refuses rather than claim "saved".
  it('names a pull request whose creation response was lost, instead of opening another', async () => {
    await f.store.git(['remote', 'set-url', '--push', 'origin', path.join(f.store.tmp.root, 'nowhere.git')]);
    await expect(capture({ source_id: 'meeting/12' })).rejects.toMatchObject({ code: 'mcp.push_failed' });
    await f.store.git(['remote', 'set-url', '--push', 'origin', f.store.origin]);
    const branch = (await sessions())[0]!.branch!;
    await f.store.git(['push', '-q', '--no-verify', 'origin', branch], (await sessions())[0]!.path);
    await f.store.forge.update((state) => {
      state.pulls.push({ number: 40, head: branch, title: 'Capture: Pricing call' });
    });
    await expect(capture({ source_id: 'meeting/12' })).rejects.toMatchObject({ code: 'mcp.already_captured', message: expect.stringContaining('pull request #40') });
    expect((await f.store.forge.read()).pulls).toHaveLength(1);
    expect(await sessions()).toHaveLength(1);
  });

  it('removes a capture whose pull request closed unmerged, so the material can be captured again', async () => {
    const first = await capture({ source_id: 'meeting/13' });
    await f.store.forge.update((state) => {
      state.pulls[0]!.state = 'closed';
    });
    const second = await capture({ source_id: 'meeting/13' });
    expect(second.pull_request.number).not.toBe(first.pull_request.number);
    expect(await sessions()).toHaveLength(1);
  });
});
