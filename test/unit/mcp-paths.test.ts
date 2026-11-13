import { describe, expect, it } from 'vitest';
import { StoreConfigSchema } from '../../src/config/schema.js';
import { ENTRY_DOCUMENT, nameablePath, readablePath, searchExclusions } from '../../src/core/mcp/paths.js';

const configWith = (excludePaths: string[]) =>
  StoreConfigSchema.parse({
    schema_version: 1,
    taxonomy: { profile: 'custom', layers: [] },
    git: { default_branch: 'main' },
    organize: { archive_destination: 'archive/' },
    retrieval: { exclude_paths: excludePaths },
  });

describe('mcp path predicates', () => {
  it('reads the entry document by name in a store that excludes it from retrieval', () => {
    const config = configWith(['.contexture/', 'raw/', 'AGENTS.md', 'CLAUDE.md']);
    expect(nameablePath(ENTRY_DOCUMENT, config)).toBe(true);
    expect(readablePath(ENTRY_DOCUMENT, config)).toBe(true);
    // Still out of search, and the other excluded files stay hidden.
    expect(searchExclusions(config)).toContain('AGENTS.md');
    expect(readablePath('CLAUDE.md', config)).toBe(false);
  });

  it('never reads the configuration, whatever is excluded', () => {
    const config = configWith(['AGENTS.md']);
    expect(readablePath('contexture.yaml', config)).toBe(false);
  });
});
