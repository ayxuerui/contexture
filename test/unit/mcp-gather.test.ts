import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolRefusal } from '../../src/core/mcp/jsonrpc.js';
import { gatherWithBodies, parseGatherArgs } from '../../src/core/mcp/tools/gather.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';

describe('mcp gather', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({
      'projects/hub.md': '# Hub\n\nSee [[alpha]] and [[beta]].\n',
      'projects/alpha.md': `# Alpha\n\n${'alpha line\n'.repeat(40)}`,
      'projects/beta.md': '# Beta\n\nbeta body\n',
      'raw/inbox/2026-01-01-call.md': '---\nsource_type: meeting\nsource_id: meeting/1\n---\nraw\n',
    });
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const gather = (args: Record<string, unknown>, budget?: number) =>
    f.view.read(f.syncDeps, (snapshot) => gatherWithBodies(snapshot, parseGatherArgs(args), budget));

  it('returns the pass in its own order with bodies attached', async () => {
    const result = await gather({ seeds: ['projects/hub.md'] });
    expect(result.notes.map((n) => n.path)).toEqual(['projects/hub.md', 'projects/alpha.md', 'projects/beta.md']);
    expect(result.notes[0]!.labels).toContain('seed');
    expect(result.notes.every((n) => typeof n.body === 'string')).toBe(true);
    expect(result.notes[2]!.body).toContain('beta body');
    expect(result.store.head).toBe(await f.store.git(['rev-parse', 'origin/main']));
  });

  it('attaches bodies to a prefix only, once the budget is spent', async () => {
    const hub = Buffer.byteLength('# Hub\n\nSee [[alpha]] and [[beta]].\n');
    const result = await gather({ seeds: ['projects/hub.md'] }, hub + 10);
    expect(result.notes.map((n) => n.body === null)).toEqual([false, true, true]);
    expect(result.bodies).toEqual({ max_bytes: hub + 10, returned: 1, omitted: 2 });
  });

  it('clips an oversized first note rather than returning no text', async () => {
    const result = await gather({ seeds: ['projects/alpha.md'], hops: 0 }, 50);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]!.body_clipped).toBe(true);
    expect(Buffer.byteLength(result.notes[0]!.body!)).toBeLessThanOrEqual(50);
  });

  it('refuses a capture as a seed before running the pass', async () => {
    await expect(gather({ seeds: ['raw/inbox/2026-01-01-call.md'] })).rejects.toMatchObject({ code: 'mcp.capture_not_filed' });
    expect(() => parseGatherArgs({})).toThrow(ToolRefusal);
  });

  it('returns a note pushed to the remote after the next sync', async () => {
    await gather({ seeds: ['projects/hub.md'] });
    await f.store.advanceMain({ 'projects/gamma.md': '# Gamma\n\nLinks back to [[hub]].\n' });
    f.tick(61);
    const result = await gather({ seeds: ['projects/hub.md'] });
    expect(result.notes.map((n) => n.path)).toContain('projects/gamma.md');
  });
});
