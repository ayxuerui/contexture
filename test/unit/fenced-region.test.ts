import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MarkerMismatchError } from '../../src/core/errors.js';
import {
  removeFencedRegion,
  removeFencedRegionFromFile,
  upsertFencedRegion,
  upsertFencedRegionInFile,
  validateFenceIntegrity,
} from '../../src/core/fs/fenced-region.js';
import { commentFence } from '../../src/core/markers.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const fence = commentFence('test-region');

describe('upsertFencedRegion (in-memory)', () => {
  it('appends the block to empty text', () => {
    const result = upsertFencedRegion('', fence, ['line-one']);
    expect(result.changed).toBe(true);
    expect(result.text).toBe(`${fence.start}\nline-one\n${fence.end}\n`);
  });

  it('appends the block after existing content, with a blank-line separator', () => {
    const result = upsertFencedRegion('existing content\n', fence, ['body']);
    expect(result.text).toBe(`existing content\n\n${fence.start}\nbody\n${fence.end}\n`);
  });

  it('preserves content outside the fence byte-for-byte on replace', () => {
    const before = `before\n${fence.start}\nold-body\n${fence.end}\nafter\n`;
    const result = upsertFencedRegion(before, fence, ['new-body']);
    expect(result.text).toBe(`before\n${fence.start}\nnew-body\n${fence.end}\nafter\n`);
  });

  it('is idempotent: re-applying an identical body yields changed:false and byte-identical text', () => {
    const first = upsertFencedRegion('', fence, ['body']);
    const second = upsertFencedRegion(first.text, fence, ['body']);
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it('throws on an unpaired start marker (no matching end)', () => {
    expect(() => upsertFencedRegion(`${fence.start}\nbody\n`, fence, ['x'])).toThrow();
  });

  it('throws on a duplicated start marker', () => {
    const broken = `${fence.start}\na\n${fence.end}\n${fence.start}\nb\n${fence.end}\n`;
    expect(() => upsertFencedRegion(broken, fence, ['x'])).toThrow();
  });

  it('throws when the end marker precedes the start marker', () => {
    expect(() => upsertFencedRegion(`${fence.end}\n${fence.start}\n`, fence, ['x'])).toThrow();
  });
});

describe('removeFencedRegion (in-memory)', () => {
  it('is a no-op on text with no matching fence', () => {
    const result = removeFencedRegion('just an ordinary file\n', fence);
    expect(result.changed).toBe(false);
    expect(result.text).toBe('just an ordinary file\n');
  });

  it('removes the fence and its body, including the blank line inserted before it', () => {
    const before = upsertFencedRegion('existing content\n', fence, ['body']);
    const result = removeFencedRegion(before.text, fence);
    expect(result.changed).toBe(true);
    expect(result.text).toBe('existing content\n');
  });

  it('removes a fence with no preceding blank line without disturbing the line before it', () => {
    const before = `before\n${fence.start}\nbody\n${fence.end}\nafter\n`;
    const result = removeFencedRegion(before, fence);
    expect(result.text).toBe('before\nafter\n');
  });

  it('removing then re-inserting into the resulting empty tail round-trips byte-for-byte', () => {
    const original = upsertFencedRegion('existing content\n', fence, ['body']);
    const removed = removeFencedRegion(original.text, fence);
    const reinserted = upsertFencedRegion(removed.text, fence, ['body']);
    expect(reinserted.text).toBe(original.text);
  });

  it('throws on an unpaired start marker, the same as upsert', () => {
    expect(() => removeFencedRegion(`${fence.start}\nbody\n`, fence)).toThrow();
  });
});

describe('upsertFencedRegionInFile', () => {
  it('writes zero bytes — leaves the file untouched — when markers are mismatched', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'target.txt');
      await writeFile(filePath, `${fence.start}\nbody\n`); // unpaired start marker
      const before = await readFile(filePath, 'utf8');
      await expect(upsertFencedRegionInFile(filePath, fence, ['new'])).rejects.toBeInstanceOf(
        MarkerMismatchError,
      );
      const after = await readFile(filePath, 'utf8');
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('skips the write entirely (mtime unchanged) when nothing changes', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'target.txt');
      await upsertFencedRegionInFile(filePath, fence, ['body']);
      const mtimeBefore = (await stat(filePath)).mtimeMs;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const { changed } = await upsertFencedRegionInFile(filePath, fence, ['body']);
      const mtimeAfter = (await stat(filePath)).mtimeMs;
      expect(changed).toBe(false);
      expect(mtimeAfter).toBe(mtimeBefore);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('removeFencedRegionFromFile', () => {
  it('is a no-op on a missing file', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'missing.txt');
      const { changed } = await removeFencedRegionFromFile(filePath, fence);
      expect(changed).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is a no-op when the fence is not present', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'target.txt');
      await writeFile(filePath, 'no fence here\n');
      const { changed } = await removeFencedRegionFromFile(filePath, fence);
      expect(changed).toBe(false);
      expect(await readFile(filePath, 'utf8')).toBe('no fence here\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes an existing fence, leaving surrounding content untouched', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'target.txt');
      await upsertFencedRegionInFile(filePath, fence, ['body']);
      await writeFile(filePath, `before\n${await readFile(filePath, 'utf8')}after\n`);
      const { changed } = await removeFencedRegionFromFile(filePath, fence);
      expect(changed).toBe(true);
      expect(await readFile(filePath, 'utf8')).toBe('before\nafter\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws on mismatched markers and writes zero bytes', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'target.txt');
      await writeFile(filePath, `${fence.start}\nbody\n`);
      const before = await readFile(filePath, 'utf8');
      await expect(removeFencedRegionFromFile(filePath, fence)).rejects.toBeInstanceOf(MarkerMismatchError);
      expect(await readFile(filePath, 'utf8')).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('validateFenceIntegrity', () => {
  it('reports no problems for a well-formed fence', () => {
    const text = `${fence.start}\nbody\n${fence.end}\n`;
    expect(validateFenceIntegrity(text)).toEqual([]);
  });

  it('reports no problems for text with no fences at all', () => {
    expect(validateFenceIntegrity('just an ordinary file\n')).toEqual([]);
  });

  it('reports an unpaired start marker', () => {
    const problems = validateFenceIntegrity(`${fence.start}\nbody\n`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('test-region');
  });

  it('reports a duplicated start marker', () => {
    const text = `${fence.start}\na\n${fence.end}\n${fence.start}\nb\n${fence.end}\n`;
    const problems = validateFenceIntegrity(text);
    expect(problems).toHaveLength(1);
  });

  it('is comment-syntax-agnostic: matches the token regardless of wrapper', () => {
    const problems = validateFenceIntegrity('<!-- >>> contexture:notes -->\nbody\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('notes');
  });

  it('tracks multiple distinct regions independently', () => {
    const text = [
      commentFence('a').start,
      'body-a',
      commentFence('a').end,
      commentFence('b').start, // unpaired
      'body-b',
    ].join('\n');
    const problems = validateFenceIntegrity(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"b"');
  });
});
