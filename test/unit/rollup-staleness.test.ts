import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkMissionStaleness, checkRollupStaleness, findStaleRollups, hasRollupSection, ROLLED_UP_FIELD, ROLLUP_FENCE } from '../../src/core/rollup.js';
import type { Note } from '../../src/core/notes/list.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

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

function plainNote(relPath: string, rolledUp: string | null): Note {
  const frontmatter: Record<string, unknown> = {};
  if (rolledUp !== null) frontmatter[ROLLED_UP_FIELD] = rolledUp;
  return { path: relPath, frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined, body: '# Mission\n\nno rollup fence yet\n' };
}

describe('checkMissionStaleness (context-organize spec: generalize-identity-migration-residue)', () => {
  it('an unwritten mission document (no recorded timestamp) is stale', () => {
    const note = plainNote('MISSION.md', null);
    const result = checkMissionStaleness(note, 7, new Date('2026-06-01T00:00:00.000Z'));
    expect(result).toEqual({ entity: 'MISSION.md', rolledUp: null, newestBacklink: null });
  });

  it('an aged mission document is stale once elapsed time exceeds staleDays', () => {
    const note = entity('MISSION.md', '2026-01-01T00:00:00.000Z'); // has a ROLLUP_FENCE too — irrelevant to this rule
    const result = checkMissionStaleness(note, 7, new Date('2026-02-01T00:00:00.000Z'));
    expect(result).toEqual({ entity: 'MISSION.md', rolledUp: '2026-01-01T00:00:00.000Z', newestBacklink: null });
  });

  it('a freshly rolled-up mission document (within staleDays) is not stale', () => {
    const note = entity('MISSION.md', '2026-01-30T00:00:00.000Z');
    const result = checkMissionStaleness(note, 7, new Date('2026-02-01T00:00:00.000Z'));
    expect(result).toBeNull();
  });

  it('staleness is purely time-based: no backlinks or git are ever consulted', () => {
    // No backlinking note exists at all, unlike checkRollupStaleness's requirement of at least one.
    const note = plainNote('MISSION.md', null);
    expect(checkMissionStaleness(note, 0, new Date('2026-01-01T00:00:00.000Z'))).not.toBeNull();
  });
});

/**
 * compose-store-guidance-documents: the mission document is now read
 * directly from disk (it typically lives under the guidance directory,
 * which is excluded from the note listing `findStaleRollups`'s other half
 * still operates on in-memory) — these tests write a real file under a
 * temp store root rather than relying on the `notes` array to carry it.
 */
async function writeMissionFile(root: string, relPath: string, rolledUp: string | null, extra = ''): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  const frontmatter = rolledUp !== null ? `---\n${ROLLED_UP_FIELD}: ${rolledUp}\n---\n` : '';
  await writeFile(full, `${frontmatter}# Mission\n\n${extra}`);
}

describe('findStaleRollups (mission path)', () => {
  it('an unwritten mission document is included as a candidate even without a ROLLUP_FENCE', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeMissionFile(tmp.root, 'MISSION.md', null);
      const git = gitWithDates({});
      const results = await findStaleRollups(git, tmp.root, [], { missionPath: 'MISSION.md' }, 7, new Date('2026-06-01T00:00:00.000Z'));
      expect(results.map((r) => r.entity)).toEqual(['MISSION.md']);
      expect(results[0]?.newestBacklink).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('an aged mission document is stale regardless of unrelated notes being recently modified', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeMissionFile(tmp.root, 'MISSION.md', '2026-01-01T00:00:00.000Z');
      const notes = [entity('other.md', '2026-05-01T00:00:00.000Z')];
      const git = gitWithDates({});
      const results = await findStaleRollups(git, tmp.root, notes, { missionPath: 'MISSION.md' }, 7, new Date('2026-02-01T00:00:00.000Z'));
      expect(results.map((r) => r.entity)).toEqual(['MISSION.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a freshly rolled-up mission document is not reported', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeMissionFile(tmp.root, 'MISSION.md', '2026-01-30T00:00:00.000Z');
      const git = gitWithDates({});
      const results = await findStaleRollups(git, tmp.root, [], { missionPath: 'MISSION.md' }, 7, new Date('2026-02-01T00:00:00.000Z'));
      expect(results).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('an unconfigured mission path (no file on disk) yields no mission candidate', async () => {
    const tmp = await makeTmpDir();
    try {
      const git = gitWithDates({});
      const results = await findStaleRollups(git, tmp.root, [], { missionPath: 'MISSION.md' }, 7, new Date());
      expect(results).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('with no missionPath configured, the candidate set and results are unchanged from the pre-existing behavior', async () => {
    const notes = [entity('topic.md', null), backlink('a.md', 'topic')];
    const git = gitWithDates({ 'a.md': '2026-01-01T00:00:00.000Z' });
    const withoutMission = await findStaleRollups(git, '/repo', notes);
    const withUndefinedMission = await findStaleRollups(git, '/repo', notes, { missionPath: undefined }, 0, new Date());
    expect(withoutMission.map((r) => r.entity)).toEqual(['topic.md']);
    expect(withUndefinedMission.map((r) => r.entity)).toEqual(['topic.md']);
  });

  it('a note matching both the entity scan and the configured mission path is reported once, under the mission rule', async () => {
    // "topic.md" carries a ROLLUP_FENCE (so the entity scan would normally
    // evaluate it) AND is the configured mission path — the mission rule
    // must own it exclusively, not double-report or blend rules.
    const tmp = await makeTmpDir();
    try {
      await writeMissionFile(tmp.root, 'topic.md', '2026-01-01T00:00:00.000Z', `${ROLLUP_FENCE.start}\nsynthesis\n${ROLLUP_FENCE.end}\n`);
      const notes = [entity('topic.md', '2026-01-01T00:00:00.000Z'), backlink('a.md', 'topic')];
      const git = gitWithDates({ 'a.md': '2026-03-01T00:00:00.000Z' }); // would be stale under the backlink rule
      const results = await findStaleRollups(git, tmp.root, notes, { missionPath: 'topic.md' }, 7, new Date('2026-01-05T00:00:00.000Z')); // fresh under the mission rule
      expect(results).toEqual([]); // mission rule wins: fresh, not stale — not the backlink rule's stale verdict
    } finally {
      await tmp.cleanup();
    }
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
