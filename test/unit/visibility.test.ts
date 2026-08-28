import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { Note } from '../../src/core/notes/list.js';
import { resolveVisibility } from '../../src/core/notes/visibility.js';

function makeConfig(overrides: Partial<StoreConfig['visibility']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, ...overrides },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
  } as StoreConfig;
}

function note(path: string, frontmatter?: Record<string, unknown>): Note {
  return { path, frontmatter, body: '' };
}

describe('resolveVisibility', () => {
  it('resolves to the explicit field value when present', () => {
    const config = makeConfig();
    const result = resolveVisibility(config, note('a.md', { scope: 'work' }));
    expect(result).toEqual({ value: 'work', reason: 'explicit' });
  });

  it('reads the CONFIGURED field key, not a hardcoded "scope"', () => {
    const config = { ...makeConfig(), fields: { visibility: 'lens' } };
    const result = resolveVisibility(config, note('a.md', { lens: 'work', scope: 'ignored' }));
    expect(result).toEqual({ value: 'work', reason: 'explicit' });
  });

  it('falls back to a directory default when no explicit field is set', () => {
    const config = makeConfig({ directory_defaults: { 'areas/Life': 'personal' } });
    const result = resolveVisibility(config, note('areas/Life/journal.md'));
    expect(result).toEqual({ value: 'personal', reason: 'directory default' });
  });

  it('an explicit field beats a directory default', () => {
    const config = makeConfig({ directory_defaults: { areas: 'shared' } });
    const result = resolveVisibility(config, note('areas/x.md', { scope: 'private' }));
    expect(result).toEqual({ value: 'private', reason: 'explicit' });
  });

  it('the longest matching directory prefix wins', () => {
    const config = makeConfig({
      directory_defaults: { areas: 'shared', 'areas/Life': 'personal' },
    });
    const result = resolveVisibility(config, note('areas/Life/journal.md'));
    expect(result.value).toBe('personal');
  });

  it('falls back to the configured fail-closed default when nothing else applies', () => {
    const config = makeConfig();
    const result = resolveVisibility(config, note('random.md'));
    expect(result).toEqual({ value: 'private', reason: 'fail-closed default' });
  });

  it('a note with no frontmatter at all resolves via the fail-closed path', () => {
    const config = makeConfig();
    const result = resolveVisibility(config, { path: 'a.md', frontmatter: undefined, body: '' });
    expect(result.reason).toBe('fail-closed default');
  });

  it('an empty-string explicit value does not count as explicit', () => {
    const config = makeConfig({ directory_defaults: { a: 'shared' } });
    const result = resolveVisibility(config, note('a/x.md', { scope: '' }));
    expect(result.reason).toBe('directory default');
  });
});
