import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MarkerMismatchError } from '../../src/core/errors.js';
import { upsertFencedRegion, upsertFencedRegionInFile } from '../../src/core/fs/fenced-region.js';
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
