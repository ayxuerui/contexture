import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveFiling, slugifyPath, slugifySegment } from '../../src/core/publish/filing.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const PUBLISH = 'publish/';

async function writePage(root: string, publishRelative: string, readme: string): Promise<void> {
  const dir = path.join(root, PUBLISH, publishRelative);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
  await writeFile(path.join(dir, 'README.md'), readme);
}

describe('slugifySegment', () => {
  it('folds case and turns each run of non-alphanumerics into one separator', () => {
    expect(slugifySegment('Ctx A')).toBe('ctx-a');
    expect(slugifySegment('Ctx A,  B')).toBe('ctx-a-b');
    expect(slugifySegment('Ctx-A-2026')).toBe('ctx-a-2026');
    expect(slugifySegment('Ctx.A')).toBe('ctx-a');
  });

  it('treats & as punctuation rather than expanding it to a word (D6)', () => {
    expect(slugifySegment('Ctx A & B')).toBe('ctx-a-b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifySegment('  Ctx A — ')).toBe('ctx-a');
    expect(slugifySegment('- ctx-a -')).toBe('ctx-a');
  });

  it('returns an empty string for a segment carrying no letter or digit', () => {
    expect(slugifySegment('...')).toBe('');
    expect(slugifySegment('---')).toBe('');
  });

  it('keeps the letters of a script with no ASCII form (D6)', () => {
    expect(slugifySegment('世界模型')).toBe('世界模型');
    expect(slugifySegment('Справочник')).toBe('справочник');
    expect(slugifySegment('Café Notes')).toBe('café-notes');
  });

  it('derives the same slug from a decomposed name as from its composed form', () => {
    const composed = 'Café Notes'; // e-acute as one code point
    const decomposed = 'Café Notes'; // e + combining acute
    expect(composed).not.toBe(decomposed);
    expect(slugifySegment(decomposed)).toBe(slugifySegment(composed));
    expect(slugifySegment(decomposed)).toBe('café-notes');
  });

  it('is idempotent — the scan compares both sides through it', () => {
    for (const raw of ['Ctx A & B', 'Ctx-A-2026', 'Café Notes', '世界模型']) {
      expect(slugifySegment(slugifySegment(raw))).toBe(slugifySegment(raw));
    }
  });

  it('never truncates (D6)', () => {
    const long = 'Ctx A Director of Engineering, Quality and Research';
    expect(slugifySegment(long)).toBe('ctx-a-director-of-engineering-quality-and-research');
  });
});

describe('slugifyPath', () => {
  it('slugifies a segment at a time and never across the separator', () => {
    expect(slugifyPath('Ctx A/Work Notes/Deep Folder')).toBe('ctx-a/work-notes/deep-folder');
  });

  it('drops a segment that slugifies to nothing', () => {
    expect(slugifyPath('ctx-a/.../work')).toBe('ctx-a/work');
  });

  it('answers empty for an empty path', () => {
    expect(slugifyPath('')).toBe('');
  });
});

describe('deriveFiling: the group comes from the selector', () => {
  it('derives a subtree subject from the prefix it names, with no subject segment', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: 'ctx-a/work' });
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.path).toBe('publish/ctx-a/work');
      expect(filing.subject_segment).toBeNull();
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('derives a note subject from the directory holding it', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: 'Ctx A/Work', noteStem: 'Ctx Note' });
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.subject_segment).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('carries the store folder depth whole, rather than stopping at two levels', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: 'ctx-a/work/deep/deeper', noteStem: 'Ctx Note' });
      expect(filing.prefix).toBe('ctx-a/work/deep/deeper');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports no derived path for a subtree subject naming the store root', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: '' });
      expect(filing.prefix).toBeNull();
      expect(filing.path).toBeNull();
      expect(filing.group).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('names a store-root note by its own segment, so the page is not filed flat (D3)', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: '', noteStem: 'Ctx Note' });
      expect(filing.prefix).toBe('ctx-note');
      expect(filing.subject_segment).toBe('ctx-note');
      expect(filing.group).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('deriveFiling: the subject segment and the moves it implies', () => {
  const subject = { directory: 'ctx-a/work', noteStem: 'Ctx Note' };

  it('inserts no segment when nothing under the group counts as the subject`s', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-other', '# other\n\n[[Ctx Elsewhere]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.subject_segment).toBeNull();
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('inserts the segment and reports the move when a README leads with the subject note', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-one', '# page-one\n\n## Source notes\n- [[Ctx Note]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work/ctx-note');
      expect(filing.subject_segment).toBe('ctx-note');
      expect(filing.moves).toEqual([
        { from: 'ctx-a/work/page-one', to: 'ctx-a/work/ctx-note/page-one', matched_by: 'readme-link' },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not count a page that merely cites the subject after its own (D4)', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-one', '# page-one\n\n## Source notes\n- [[Ctx Other]]\n- [[Ctx Note]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.subject_segment).toBeNull();
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('counts a page whose own segment names the subject, README or not', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/ctx-note', '# ctx-note\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work/ctx-note');
      expect(filing.moves).toEqual([
        { from: 'ctx-a/work/ctx-note', to: 'ctx-a/work/ctx-note/ctx-note', matched_by: 'page-name' },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports no move once every counted page already sits under the segment', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/ctx-note/page-one', '# page-one\n\n[[Ctx Note]]\n');
      await writePage(tmp.root, 'ctx-a/work/ctx-note/page-two', '# page-two\n\n[[Ctx Note]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work/ctx-note');
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never examines a directory deeper than the two it files into (D4)', async () => {
    const tmp = await makeTmpDir();
    try {
      // A deeper store folder's own group — its pages are not this subject's.
      await writePage(tmp.root, 'ctx-a/work/deeper/page-one', '# page-one\n\n[[Ctx Note]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.subject_segment).toBeNull();
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('ignores a wikilink in the README frontmatter, reading the body alone', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-one', '---\ntitle: "[[Ctx Note]]"\n---\n# page-one\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.subject_segment).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('treats a directory with no index page as a grouping node, not a page', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, PUBLISH, 'ctx-a/work/not-a-page'), { recursive: true });
      await writeFile(path.join(tmp.root, PUBLISH, 'ctx-a/work/not-a-page/README.md'), '[[Ctx Note]]\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.subject_segment).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('answers a missing group directory as no pages at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.moves).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never gives a subtree subject a segment, however many pages already sit there', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-one', '# page-one\n');
      await writePage(tmp.root, 'ctx-a/work/page-two', '# page-two\n');
      const filing = await deriveFiling(tmp.root, PUBLISH, { directory: 'ctx-a/work' });
      expect(filing.prefix).toBe('ctx-a/work');
      expect(filing.subject_segment).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports the move but changes nothing on disk (D5)', async () => {
    const tmp = await makeTmpDir();
    try {
      await writePage(tmp.root, 'ctx-a/work/page-one', '# page-one\n\n[[Ctx Note]]\n');
      const before = await readdirDeep(path.join(tmp.root, PUBLISH));
      const filing = await deriveFiling(tmp.root, PUBLISH, subject);
      expect(filing.moves).toHaveLength(1);
      expect(await readdirDeep(path.join(tmp.root, PUBLISH))).toEqual(before);
    } finally {
      await tmp.cleanup();
    }
  });
});

async function readdirDeep(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push(rel);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
    }
  }
  await walk(root, '');
  return out.sort();
}
