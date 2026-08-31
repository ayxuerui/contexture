import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { IdentityEntryMatchError } from '../../src/core/errors.js';
import {
  addIdentityEntry,
  ensureIdentityFiles,
  identityFilePath,
  identityFilePaths,
  IDENTITY_FILES,
  IDENTITY_ROLES,
  joinEntries,
  removeIdentityEntry,
  replaceIdentityEntry,
  splitEntries,
} from '../../src/core/identity.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig['identity']> = {}): StoreConfig {
  const identityPath = overrides.path ?? 'identity/';
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [identityPath], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    identity: { path: identityPath, files: {}, entry_delimiter: '', ...overrides },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('identityFilePath / identityFilePaths (session-capture-command D3)', () => {
  it('resolves each role to its canonical file under the configured identity path by default', () => {
    const config = makeConfig();
    expect(identityFilePath(config, 'posture')).toBe('identity/posture.md');
    expect(identityFilePath(config, 'world-facts')).toBe('identity/world-facts.md');
    expect(identityFilePath(config, 'user-facts')).toBe('identity/user-facts.md');
    expect(identityFilePaths(config)).toEqual(IDENTITY_ROLES.map((role) => `identity/${IDENTITY_FILES[role]}`));
  });

  it('reflects a non-default identity path', () => {
    expect(identityFilePaths(makeConfig({ path: 'memory/' }))).toEqual(['memory/posture.md', 'memory/world-facts.md', 'memory/user-facts.md']);
  });

  it('an unbound role falls back to its canonical file, identically to a store created before this capability', () => {
    const config = makeConfig({ files: { posture: 'twin/SOUL.md' } });
    expect(identityFilePath(config, 'posture')).toBe('twin/SOUL.md');
    expect(identityFilePath(config, 'world-facts')).toBe('identity/world-facts.md');
  });

  it('a role can be bound outside the identity directory entirely', () => {
    const config = makeConfig({ files: { 'world-facts': 'twin/memory/MEMORY.md' } });
    expect(identityFilePath(config, 'world-facts')).toBe('twin/memory/MEMORY.md');
  });
});

describe('ensureIdentityFiles', () => {
  it('creates all three canonical files when none exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      const created = await ensureIdentityFiles(tmp.root, config);
      expect(created.sort()).toEqual(identityFilePaths(config).sort());
      for (const relPath of created) {
        const content = await readFile(path.join(tmp.root, relPath), 'utf8');
        expect(content.length).toBeGreaterThan(0);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('never overwrites an existing identity file', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'identity'), { recursive: true });
      await writeFile(path.join(tmp.root, 'identity', 'posture.md'), 'hand-authored content\n');

      const created = await ensureIdentityFiles(tmp.root, makeConfig());
      expect(created).not.toContain('identity/posture.md');

      const content = await readFile(path.join(tmp.root, 'identity/posture.md'), 'utf8');
      expect(content).toBe('hand-authored content\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a role bound outside identity.path is ensured there', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig({ files: { 'world-facts': 'twin/memory/MEMORY.md' } });
      const created = await ensureIdentityFiles(tmp.root, config);
      expect(created).toContain('twin/memory/MEMORY.md');
      const content = await readFile(path.join(tmp.root, 'twin/memory/MEMORY.md'), 'utf8');
      expect(content.length).toBeGreaterThan(0);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('splitEntries / joinEntries (session-capture-command D4)', () => {
  it('splits paragraphs on a blank line by default', () => {
    expect(splitEntries('first\npara\n\nsecond\n\nthird', '')).toEqual(['first\npara', 'second', 'third']);
  });

  it('a heading-sectioned file: each heading-plus-body block is one entry, split at the blank line', () => {
    const text = '## Heading one\nbody one\n\n## Heading two\nbody two\n';
    expect(splitEntries(text, '')).toEqual(['## Heading one\nbody one', '## Heading two\nbody two']);
  });

  it('splits on a custom delimiter line', () => {
    expect(splitEntries('first\n§\nsecond\n§\nthird', '§')).toEqual(['first', 'second', 'third']);
  });

  it('joinEntries is the inverse of splitEntries for both delimiter styles', () => {
    expect(splitEntries(joinEntries(['a', 'b', 'c'], ''), '')).toEqual(['a', 'b', 'c']);
    expect(splitEntries(joinEntries(['a', 'b', 'c'], '§'), '§')).toEqual(['a', 'b', 'c']);
  });
});

async function writeIdentityFile(root: string, relPath: string, content: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
  await writeFile(path.join(root, relPath), content);
}

describe('addIdentityEntry / replaceIdentityEntry / removeIdentityEntry (session-capture-command D4)', () => {
  it('add appends a new entry; the prior entries are byte-identical', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await writeIdentityFile(tmp.root, 'identity/world-facts.md', 'first\n\nsecond\n');

      const result = await addIdentityEntry(tmp.root, config, 'world-facts', 'third');
      expect(result.entries).toBe(3);
      const text = await readFile(path.join(tmp.root, 'identity/world-facts.md'), 'utf8');
      expect(text).toBe('first\n\nsecond\n\nthird\n');
      expect(splitEntries(text, '')).toEqual(['first', 'second', 'third']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('add creates the file when it does not exist yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await addIdentityEntry(tmp.root, makeConfig(), 'posture', 'be terse');
      expect(result).toEqual({ path: 'identity/posture.md', entries: 1 });
      expect(await readFile(path.join(tmp.root, 'identity/posture.md'), 'utf8')).toBe('be terse\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('add works on a custom-delimiter file', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig({ entry_delimiter: '§' });
      await writeIdentityFile(tmp.root, 'identity/world-facts.md', 'first\n§\nsecond\n');
      const result = await addIdentityEntry(tmp.root, config, 'world-facts', 'third');
      expect(result.entries).toBe(3);
      expect(await readFile(path.join(tmp.root, 'identity/world-facts.md'), 'utf8')).toBe('first\n§\nsecond\n§\nthird\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('replace swaps the single entry containing match', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await writeIdentityFile(tmp.root, 'identity/user-facts.md', 'likes concise answers\n\nprefers dark mode\n');
      const result = await replaceIdentityEntry(tmp.root, config, 'user-facts', 'concise', 'likes terse answers');
      expect(result.entries).toBe(2);
      expect(await readFile(path.join(tmp.root, 'identity/user-facts.md'), 'utf8')).toBe('likes terse answers\n\nprefers dark mode\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('remove deletes the single entry containing match', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await writeIdentityFile(tmp.root, 'identity/user-facts.md', 'stale fact\n\nkeep this one\n');
      const result = await removeIdentityEntry(tmp.root, config, 'user-facts', 'stale');
      expect(result.entries).toBe(1);
      expect(await readFile(path.join(tmp.root, 'identity/user-facts.md'), 'utf8')).toBe('keep this one\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('zero matches refuses with a distinct error and writes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await writeIdentityFile(tmp.root, 'identity/user-facts.md', 'one\n\ntwo\n');
      await expect(replaceIdentityEntry(tmp.root, config, 'user-facts', 'nonexistent', 'x')).rejects.toBeInstanceOf(
        IdentityEntryMatchError,
      );
      expect(await readFile(path.join(tmp.root, 'identity/user-facts.md'), 'utf8')).toBe('one\n\ntwo\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('multiple matches refuses as ambiguous and writes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await writeIdentityFile(tmp.root, 'identity/user-facts.md', 'likes coffee\n\nlikes tea\n');
      await expect(removeIdentityEntry(tmp.root, config, 'user-facts', 'likes')).rejects.toBeInstanceOf(IdentityEntryMatchError);
      expect(await readFile(path.join(tmp.root, 'identity/user-facts.md'), 'utf8')).toBe('likes coffee\n\nlikes tea\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
