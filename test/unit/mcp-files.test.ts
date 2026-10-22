import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderGrep, renderRead, type GrepResult, type ReadResult } from '../../src/core/mcp/tools/files.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';

describe('mcp Read, Grep and Glob', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({
      'projects/a.md': '# A\n\nline three\nkestrel launch\nline five\n',
      'projects/b.md': '# B\n\nThe Kestrel plan.\n',
      'areas/c.md': '# C\n\nnothing\n',
      'raw/inbox/2026-01-01-call.md': '---\nsource_type: meeting\nsource_id: meeting/1\n---\nkestrel in a capture\n',
    });
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const read = (args: Record<string, unknown>, email?: string) => f.call('Read', args, email) as Promise<unknown> as Promise<ReadResult>;
  const grep = (args: Record<string, unknown>) => f.call('Grep', args) as Promise<unknown> as Promise<GrepResult>;

  it('reads a note numbered like cat -n, with offset and limit', async () => {
    const all = await read({ file_path: '/projects/a.md' });
    expect(all.content.split('\n')[0]).toBe('     1\t# A');
    expect(all.total_lines).toBe(5);
    const range = await read({ file_path: 'projects/a.md', offset: 3, limit: 2 });
    expect(range.content).toBe('     3\tline three\n     4\tkestrel launch');
    expect(renderRead(range)).toContain('Showing lines 3–4 of 5');
    expect(range.url).toBe('https://ctx-a.example.test/notes/projects/a.md');
    expect(renderRead(range)).toContain('at https://ctx-a.example.test/notes/projects/a.md');
  });

  it('reads a capture marked as one, and the entry document', async () => {
    const capture = await read({ file_path: 'raw/inbox/2026-01-01-call.md' });
    expect(capture.capture).toBe(true);
    expect(renderRead(capture)).toContain('This is a capture');
    expect((await read({ file_path: 'AGENTS.md' })).total_lines).toBeGreaterThan(0);
  });

  it('refuses configuration, derived files and paths leaving the store', async () => {
    for (const file_path of ['contexture.yaml', '.contexture/cache/graph.json', '../outside.md', 'projects/../../x.md']) {
      await expect(read({ file_path })).rejects.toMatchObject({ code: expect.stringMatching(/^mcp\.path_/) });
    }
    await expect(read({ file_path: 'projects/missing.md' })).rejects.toMatchObject({ code: 'mcp.file_not_found' });
  });

  it('greps in each output mode, path-ordered, with context and a glob, never touching excluded paths', async () => {
    const files = await grep({ pattern: 'kestrel', '-i': true });
    expect(files.lines).toEqual(['projects/a.md', 'projects/b.md', 'raw/inbox/2026-01-01-call.md']);
    const content = await grep({ pattern: 'kestrel', output_mode: 'content', glob: 'projects/**' });
    expect(content.lines).toEqual(['projects/a.md:4:kestrel launch']);
    const context = await grep({ pattern: 'kestrel launch', output_mode: 'content', '-B': 1, path: 'projects' });
    expect(context.lines).toEqual(['projects/a.md-3-line three', 'projects/a.md:4:kestrel launch']);
    const counts = await grep({ pattern: 'line', output_mode: 'count', path: 'projects' });
    expect(counts.lines).toEqual(['projects/a.md:2']);
    const hidden = await grep({ pattern: 'schema_version', glob: '*.yaml' });
    expect(hidden.lines).toEqual([]);
    expect(renderGrep(hidden)).toBe('No matches found.');
    await expect(grep({ pattern: 'x', path: '.contexture' })).rejects.toMatchObject({ code: 'mcp.path_not_readable' });
    await expect(grep({ pattern: '(' })).rejects.toMatchObject({ code: 'mcp.search_failed' });
  });

  it('lists a capture awaiting approval after the results', async () => {
    await f.call('capture', { title: 'Kestrel sync', body: 'Kestrel moved again.\n', source_type: 'meeting' });
    f.tick(61);
    const result = await grep({ pattern: 'Kestrel moved', output_mode: 'content' });
    expect(result.lines).toEqual([]);
    expect(result.awaiting_approval).toHaveLength(1);
    expect(renderGrep(result)).toContain('(awaiting approval):');
  });

  it('globs in path order and never lists excluded files', async () => {
    const all = (await f.call('Glob', { pattern: '**/*.md' })) as { files: string[] };
    expect(all.files).toEqual([...all.files].sort());
    expect(all.files).toEqual(expect.arrayContaining(['areas/c.md', 'projects/a.md', 'projects/b.md']));
    expect(all.files.some((p) => p.startsWith('.contexture/'))).toBe(false);
    const scoped = (await f.call('Glob', { pattern: '*.md', path: 'projects' })) as { files: string[] };
    expect(scoped.files).toEqual(['projects/a.md', 'projects/b.md']);
  });

  it('returns a member their own draft of a note, and everyone else the store version', async () => {
    await f.call('Edit', { file_path: 'projects/b.md', old_string: 'The Kestrel plan.', new_string: 'The Kestrel plan, revised.' });
    const mine = await read({ file_path: 'projects/b.md' });
    expect(mine.draft).toBe(true);
    expect(mine.content).toContain('revised');
    const theirs = await read({ file_path: 'projects/b.md' }, 'b@example.com');
    expect(theirs.draft).toBe(false);
    expect(theirs.content).not.toContain('revised');
  });
});
