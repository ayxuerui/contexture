import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { evaluateDisclosure } from '../../src/core/disclosure/model.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(overrides: Partial<StoreConfig['disclosure']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], ...overrides },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/' },
    harness: { procedures_path: 'procedures/' },
    adapters: [],
  };
}

function note(path: string, frontmatter: Record<string, unknown> | undefined = undefined): Note {
  return { path, frontmatter, body: '' };
}

describe('evaluateDisclosure', () => {
  it('rung 4: an untagged note with no applicable wall and an external audience returns ASK, not DENY or ALLOW', () => {
    const config = makeConfig();
    const result = evaluateDisclosure(config, note('projects/a.md'), 'external');
    expect(result).toEqual({ verdict: 'ask', rung: 'external_default' });
  });

  it('rung 2: an explicit audience tag matching the requested audience allows, without reaching the default', () => {
    const config = makeConfig();
    const result = evaluateDisclosure(config, note('projects/a.md', { audience: ['external'] }), 'external');
    expect(result).toEqual({ verdict: 'allow', rung: 'explicit_tag' });
  });

  it('rung 2: a tag for a different audience does not match', () => {
    const config = makeConfig();
    const result = evaluateDisclosure(config, note('projects/a.md', { audience: ['partner-x'] }), 'external');
    expect(result).toEqual({ verdict: 'ask', rung: 'external_default' });
  });

  it('rung 1: a hard wall overrides an explicit tag that would otherwise allow', () => {
    const config = makeConfig({ hard_walls: [{ audience: 'external', verdict: 'deny' }] });
    const result = evaluateDisclosure(config, note('secrets/a.md', { audience: ['external'] }), 'external');
    expect(result).toEqual({ verdict: 'deny', rung: 'hard_wall' });
  });

  it('rung 1: a hard wall scoped by note_path_prefix only applies under that prefix', () => {
    const config = makeConfig({ hard_walls: [{ audience: 'external', note_path_prefix: 'secrets/', verdict: 'deny' }] });
    const walled = evaluateDisclosure(config, note('secrets/a.md'), 'external');
    const unwalled = evaluateDisclosure(config, note('projects/a.md'), 'external');
    expect(walled).toEqual({ verdict: 'deny', rung: 'hard_wall' });
    expect(unwalled).toEqual({ verdict: 'ask', rung: 'external_default' });
  });

  it('rung 1: a wall can also ALLOW, short-circuiting before any other rung', () => {
    const config = makeConfig({ hard_walls: [{ audience: 'external', verdict: 'allow' }] });
    const result = evaluateDisclosure(config, note('projects/a.md'), 'external');
    expect(result).toEqual({ verdict: 'allow', rung: 'hard_wall' });
  });

  it('rung 3: an internal audience whose resolved visibility matches is allowed', () => {
    const config = makeConfig({ internal_audiences: ['ctx-a'] });
    const result = evaluateDisclosure(config, note('projects/a.md', { scope: 'ctx-a' }), 'ctx-a');
    expect(result).toEqual({ verdict: 'allow', rung: 'internal_visibility' });
  });

  it('rung 3: an internal audience whose resolved visibility does not match is denied', () => {
    const config = makeConfig({ internal_audiences: ['ctx-a'] });
    const result = evaluateDisclosure(config, note('projects/a.md', { scope: 'ctx-b' }), 'ctx-a');
    expect(result).toEqual({ verdict: 'deny', rung: 'internal_visibility' });
  });

  it('rung 3 never applies to an external audience: broad internal visibility does not imply external disclosure', () => {
    const config = makeConfig({ internal_audiences: ['ctx-a'] });
    // "shared" is visible to many internal contexts, but "external" is not itself declared internal.
    const result = evaluateDisclosure(config, note('projects/a.md', { scope: 'shared' }), 'external');
    expect(result).toEqual({ verdict: 'ask', rung: 'external_default' });
  });

  it('rung ordering: a hard wall is consulted before an internal-audience visibility match', () => {
    const config = makeConfig({
      internal_audiences: ['ctx-a'],
      hard_walls: [{ audience: 'ctx-a', verdict: 'deny' }],
    });
    const result = evaluateDisclosure(config, note('projects/a.md', { scope: 'ctx-a' }), 'ctx-a');
    expect(result).toEqual({ verdict: 'deny', rung: 'hard_wall' });
  });
});

describe('evaluateDisclosure with a context mapping (visibility.contexts)', () => {
  function withContexts(
    config: StoreConfig,
    contexts: Record<string, string[]>,
  ): StoreConfig {
    return { ...config, visibility: { ...config.visibility, contexts } };
  }

  it('rung 3 allows a shared visibility value for every internal audience mapped to it', () => {
    const config = withContexts(makeConfig({ internal_audiences: ['ctx-a', 'ctx-b'] }), {
      'ctx-a': ['ctx-a', 'ctx-shared'],
      'ctx-b': ['ctx-b', 'ctx-shared'],
    });
    const shared = note('projects/n.md', { scope: 'ctx-shared' });
    expect(evaluateDisclosure(config, shared, 'ctx-a')).toEqual({ verdict: 'allow', rung: 'internal_visibility' });
    expect(evaluateDisclosure(config, shared, 'ctx-b')).toEqual({ verdict: 'allow', rung: 'internal_visibility' });
  });

  it('rung 3 still denies a value outside the mapped list', () => {
    const config = withContexts(makeConfig({ internal_audiences: ['ctx-a'] }), { 'ctx-a': ['ctx-a', 'ctx-shared'] });
    const other = note('projects/n.md', { scope: 'ctx-b' });
    expect(evaluateDisclosure(config, other, 'ctx-a')).toEqual({ verdict: 'deny', rung: 'internal_visibility' });
  });
});

describe('hard walls: wildcard, except, and ask', () => {
  it('a wildcard ASK wall asks for every audience', () => {
    const config = makeConfig({ hard_walls: [{ audience: '*', note_path_prefix: 'walled/', verdict: 'ask' }] });
    const walled = note('walled/n.md');
    expect(evaluateDisclosure(config, walled, 'ctx-x')).toEqual({ verdict: 'ask', rung: 'hard_wall' });
    expect(evaluateDisclosure(config, walled, 'ctx-y')).toEqual({ verdict: 'ask', rung: 'hard_wall' });
  });

  it('an exempted audience passes the wall and reaches later rungs', () => {
    const config = makeConfig({
      hard_walls: [{ audience: '*', note_path_prefix: 'walled/', except: ['ctx-a'], verdict: 'ask' }],
    });
    const walled = note('walled/n.md');
    // Non-exempt audience hits the wall.
    expect(evaluateDisclosure(config, walled, 'ctx-b')).toEqual({ verdict: 'ask', rung: 'hard_wall' });
    // Exempt audience falls through — untagged + external here, so the default rung answers.
    expect(evaluateDisclosure(config, walled, 'ctx-a')).toEqual({ verdict: 'ask', rung: 'external_default' });
  });

  it('an ASK wall short-circuits an explicit tag that would otherwise allow', () => {
    const config = makeConfig({ hard_walls: [{ audience: '*', note_path_prefix: 'walled/', verdict: 'ask' }] });
    const tagged = note('walled/n.md', { audience: ['ctx-b'] });
    expect(evaluateDisclosure(config, tagged, 'ctx-b')).toEqual({ verdict: 'ask', rung: 'hard_wall' });
  });

  it('an exempted audience with a matching explicit tag is allowed at the tag rung', () => {
    const config = makeConfig({
      hard_walls: [{ audience: '*', note_path_prefix: 'walled/', except: ['ctx-a'], verdict: 'ask' }],
    });
    const tagged = note('walled/n.md', { audience: ['ctx-a'] });
    expect(evaluateDisclosure(config, tagged, 'ctx-a')).toEqual({ verdict: 'allow', rung: 'explicit_tag' });
  });
});
