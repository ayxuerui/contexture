import { describe, expect, it } from 'vitest';
import { checkRollupStaleness, findStaleRollups, hasRollupSection, ROLLED_UP_FIELD, ROLLUP_FENCE } from '../../src/core/rollup.js';
import type { Note } from '../../src/core/notes/list.js';
import { fakeGitRunner } from '../helpers/fake-env.js';

function entity(relPath: string, rolledUp: string | null, extra = ''): Note {
  const frontmatter: Record<string, unknown> = {};
  if (rolledUp !== null) frontmatter[ROLLED_UP_FIELD] = rolledUp;
  const body = `# Entity\n\n${ROLLUP_FENCE.start}\nsynthesis\n${ROLLUP_FENCE.end}\n${extra}`;
  return { path: relPath, frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined, body };
}

function backlink(relPath: string, targetStem: string): Note {
  return { path: relPath, frontmatter: undefined, body: `See [[${targetStem}]].` };
}

function gitWithDates(dates: Record<string, string | null>) {
  const responses = new Map(
    Object.entries(dates).map(([p, date]) => [
      `log -1 --format=%cI -- ${p}`,
      { exitCode: 0, stdout: date ? `${date}\n` : '', stderr: '' },
    ]),
  );
  return fakeGitRunner(responses).git;
}

describe('hasRollupSection', () => {
  it('true only for a note carrying the rollup fence', () => {
    expect(hasRollupSection(entity('a.md', null))).toBe(true);
    expect(hasRollupSection({ path: 'b.md', frontmatter: undefined, body: 'plain note' })).toBe(false);
  });
});

describe('checkRollupStaleness (context-organize D4)', () => {
  it('a newer backlink marks the rollup stale', async () => {
    const notes = [entity('topic.md', '2026-01-01T00:00:00.000Z'), backlink('a.md', 'topic')];
    const git = gitWithDates({ 'a.md': '2026-02-01T00:00:00.000Z' });
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result).toEqual({
      entity: 'topic.md',
      rolledUp: '2026-01-01T00:00:00.000Z',
      newestBacklink: { path: 'a.md', modified: '2026-02-01T00:00:00.000Z' },
    });
  });

  it('a fresh rollup (every backlink older than the timestamp) is silent', async () => {
    const notes = [entity('topic.md', '2026-06-01T00:00:00.000Z'), backlink('a.md', 'topic')];
    const git = gitWithDates({ 'a.md': '2026-01-01T00:00:00.000Z' });
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result).toBeNull();
  });

  it('no recorded timestamp, with at least one backlink, is always stale', async () => {
    const notes = [entity('topic.md', null), backlink('a.md', 'topic')];
    const git = gitWithDates({ 'a.md': '2026-01-01T00:00:00.000Z' });
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result).toEqual({ entity: 'topic.md', rolledUp: null, newestBacklink: { path: 'a.md', modified: '2026-01-01T00:00:00.000Z' } });
  });

  it('no recorded timestamp AND no backlinks at all: nothing to report', async () => {
    const notes = [entity('topic.md', null)];
    const git = gitWithDates({});
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result).toBeNull();
  });

  it('a backlink with no git history counts as newer than any timestamp', async () => {
    const notes = [entity('topic.md', '2026-01-01T00:00:00.000Z'), backlink('a.md', 'topic')];
    const git = gitWithDates({ 'a.md': null }); // uncommitted
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result?.newestBacklink?.path).toBe('a.md');
  });

  it('staleDays bounds noise: a gap under the threshold is not reported, at or over it is', async () => {
    const notes = [entity('topic.md', '2026-01-01T00:00:00.000Z'), backlink('a.md', 'topic')];
    const gitUnder = gitWithDates({ 'a.md': '2026-01-05T00:00:00.000Z' }); // 4-day gap
    expect(await checkRollupStaleness(gitUnder, '/repo', notes[0]!, notes, 7)).toBeNull();

    const gitOver = gitWithDates({ 'a.md': '2026-01-10T00:00:00.000Z' }); // 9-day gap
    const result = await checkRollupStaleness(gitOver, '/repo', notes[0]!, notes, 7);
    expect(result?.entity).toBe('topic.md');
  });

  it('picks the NEWEST of several backlinks', async () => {
    const notes = [entity('topic.md', '2026-01-01T00:00:00.000Z'), backlink('a.md', 'topic'), backlink('b.md', 'topic')];
    const git = gitWithDates({ 'a.md': '2026-01-05T00:00:00.000Z', 'b.md': '2026-03-01T00:00:00.000Z' });
    const result = await checkRollupStaleness(git, '/repo', notes[0]!, notes, 0);
    expect(result?.newestBacklink).toEqual({ path: 'b.md', modified: '2026-03-01T00:00:00.000Z' });
  });
});

describe('findStaleRollups', () => {
  it('only considers notes that carry a rollup section', async () => {
    const notes = [entity('topic.md', null), backlink('a.md', 'topic'), { path: 'plain.md', frontmatter: undefined, body: 'no rollup here' }];
    const git = gitWithDates({ 'a.md': '2026-01-01T00:00:00.000Z' });
    const results = await findStaleRollups(git, '/repo', notes);
    expect(results.map((r) => r.entity)).toEqual(['topic.md']);
  });

  it('--for narrows to one entity', async () => {
    const notes = [
      entity('topic-a.md', null),
      entity('topic-b.md', null),
      backlink('link-a.md', 'topic-a'),
      backlink('link-b.md', 'topic-b'),
    ];
    const git = gitWithDates({ 'link-a.md': '2026-01-01T00:00:00.000Z', 'link-b.md': '2026-01-01T00:00:00.000Z' });
    const results = await findStaleRollups(git, '/repo', notes, { entity: 'topic-a.md' });
    expect(results.map((r) => r.entity)).toEqual(['topic-a.md']);
  });

  it('results are sorted by entity path', async () => {
    const notes = [entity('z.md', null), entity('a.md', null), backlink('link-z.md', 'z'), backlink('link-a.md', 'a')];
    const git = gitWithDates({ 'link-z.md': '2026-01-01T00:00:00.000Z', 'link-a.md': '2026-01-01T00:00:00.000Z' });
    const results = await findStaleRollups(git, '/repo', notes);
    expect(results.map((r) => r.entity)).toEqual(['a.md', 'z.md']);
  });
});
