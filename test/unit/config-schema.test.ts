import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_ROOT, DEFAULT_PUBLISH_PATH, DEFAULT_VENDORED_SKILLS, SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { readConfig } from '../../src/config/load.js';
import { renderStoreConfig } from '../../src/config/render.js';
import { InvalidConfigError, SchemaVersionMissingError, SchemaVersionNewerError } from '../../src/core/errors.js';
import { CONFIG_FILE_NAME } from '../../src/core/root.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/config');

function captureTierConfig(schemaVersion: number, inboxPath: string, captureRoot: string | null): string {
  const ingest = captureRoot === null ? `{ inbox_path: ${inboxPath} }` : `{ inbox_path: ${inboxPath}, capture_root: ${captureRoot} }`;
  return [
    `schema_version: ${schemaVersion}`,
    'taxonomy: { profile: para, layers: [] }',
    'derived: { paths: [] }',
    'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
    'git: { default_branch: main }',
    'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
    'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
    'catalog: { path: catalog/, section_max_bytes: 32768 }',
    `ingest: ${ingest}`,
    'organize: { archive_destination: archive/ }',
    'harness: { skills_path: skills/, guidance_path: guidance/ }',
    'adapters: []',
    '',
  ].join('\n');
}

/**
 * config-defaults-as-the-convention: exactly the keys a store cannot omit —
 * its schema version, the taxonomy it chose, the branch its repository
 * actually uses, and the archive destination resolved from that taxonomy.
 * Everything else is a convention the schema supplies.
 */
function minimalConfig(): string {
  return [
    'schema_version: 9',
    'taxonomy: { profile: para, layers: [] }',
    'git: { default_branch: main }',
    'organize: { archive_destination: archives/ }',
    '',
  ].join('\n');
}

describe('readConfig', () => {
  it('throws SchemaVersionNewerError when schema_version exceeds SUPPORTED_SCHEMA_VERSION', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = await readFile(path.join(FIXTURES_DIR, 'newer-schema.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(SchemaVersionNewerError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws SchemaVersionMissingError when schema_version is absent', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = await readFile(path.join(FIXTURES_DIR, 'missing-schema-version.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(SchemaVersionMissingError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws InvalidConfigError naming the offending key on a shape mismatch', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), 'schema_version: 1\ntaxonomy: "not an object"\n');
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reads a pre-migration archive_path onto archive_destination', async () => {
    // archive-destination-from-taxonomy migration (0006): a store still on
    // schema 5 must load, not fail shape validation, so `ctxr migrate` can run.
    for (const [organize, expected] of [
      ['organize: { archive_path: retired/ }', 'retired/'],
      ['organize: { archive_destination: archives/ }', 'archives/'],
      // Both spellings present: the current key wins, never the legacy one.
      ['organize: { archive_destination: archives/, archive_path: retired/ }', 'archives/'],
    ] as const) {
      const tmp = await makeTmpDir();
      try {
        const text = [
          'schema_version: 5',
          'taxonomy: { profile: para, layers: [] }',
          'fields: { visibility: lens }',
          'visibility: { default_context: private, directory_defaults: {} }',
          'derived: { paths: [] }',
          'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
          'git: { default_branch: main }',
          'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
          'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
          'catalog: { path: catalog/, section_max_bytes: 32768 }',
          'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
          'ingest: { inbox_path: inbox/ }',
          organize,
          'harness: { skills_path: skills/, guidance_path: guidance/ }',
          'adapters: []',
          '',
        ].join('\n');
        await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);

        const config = await readConfig(tmp.root);
        expect(config.organize.archive_destination, organize).toBe(expected);
        // The old spelling never survives config loading.
        expect('archive_path' in config.organize).toBe(false);
      } finally {
        await tmp.cleanup();
      }
    }
  });

  it('leaves mission_path undefined when the key is not declared', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.organize.mission_path).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('resolves publish.path to the default when a pre-existing config declares no publish key (publish spec)', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.publish.path).toBe(DEFAULT_PUBLISH_PATH);
    } finally {
      await tmp.cleanup();
    }
  });

  it('resolves skills.vendored to the default when a pre-existing config declares no skills key (vendored-craft-skills spec)', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.skills.vendored).toEqual([...DEFAULT_VENDORED_SKILLS]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts unknown top-level keys (loose validation)', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        "identity: { path: identity/, files: {}, entry_delimiter: '' }",
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
        'a_future_section: { anything: true }',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * retain-captures-as-provenance: `readConfig` runs the full schema over a
   * store pinned at an older version, so a config written before schema 9
   * has to keep loading — otherwise `ctxr migrate` could never read the file
   * it exists to rewrite.
   */
  it('loads a config predating capture_root and fills in the shipped default', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig(8, 'inbox/', null));
      const config = await readConfig(tmp.root);
      expect(config.ingest.capture_root).toBe(DEFAULT_CAPTURE_ROOT);
      expect(config.ingest.inbox_path).toBe('inbox/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses an inbox that is not inside the declared capture root, naming both values', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig(9, 'inbox/', 'raw/'));
      await expect(readConfig(tmp.root)).rejects.toThrow(/"inbox\/".*capture_root.*"raw\/"/);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses an inbox that merely equals the capture root', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig(9, 'raw/', 'raw/'));
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts an inbox nested inside the declared capture root', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig(9, 'raw/inbox/', 'raw/'));
      const config = await readConfig(tmp.root);
      expect(config.ingest.capture_root).toBe('raw/');
    } finally {
      await tmp.cleanup();
    }
  });
  /**
   * The change's headline property: a config that states only what the store
   * chose loads, and every convention resolves to its shipped value.
   */
  it('loads a config that declares only the store facts', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), minimalConfig());
      const config = await readConfig(tmp.root);

      expect(config.ingest.inbox_path).toBe(SHIPPED_DEFAULTS.ingest.inbox_path);
      expect(config.ingest.capture_root).toBe(SHIPPED_DEFAULTS.ingest.capture_root);
      expect(config.retrieval.exclude_paths).toEqual([...SHIPPED_DEFAULTS.retrieval.exclude_paths]);
      expect(config.derived.paths).toEqual([...SHIPPED_DEFAULTS.derived.paths]);
      expect(config.catalog.path).toBe(SHIPPED_DEFAULTS.catalog.path);
      expect(config.catalog.section_max_bytes).toBe(SHIPPED_DEFAULTS.catalog.section_max_bytes);
      expect(config.session.worktrees_path).toBe(SHIPPED_DEFAULTS.session.worktrees_path);
      expect(config.session.branch_prefix).toBe(SHIPPED_DEFAULTS.session.branch_prefix);
      expect(config.write_lifecycle.diff_size_ceiling_lines).toBe(SHIPPED_DEFAULTS.write_lifecycle.diff_size_ceiling_lines);
      expect(config.publish.path).toBe(SHIPPED_DEFAULTS.publish.path);
      expect(config.skills.vendored).toEqual([...SHIPPED_DEFAULTS.skills.vendored]);
      expect(config.harness.convention_max_bytes).toBe(SHIPPED_DEFAULTS.harness.convention_max_bytes);
      expect(config.adapters).toEqual([...SHIPPED_DEFAULTS.adapters]);

      // The store facts are read, never defaulted.
      expect(config.git.default_branch).toBe('main');
      expect(config.organize.archive_destination).toBe('archives/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets a declared value win over the shipped default', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = `${minimalConfig()}ingest: { inbox_path: staging/inbox/, capture_root: staging/ }\n`;
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.ingest.inbox_path).toBe('staging/inbox/');
      expect(config.ingest.capture_root).toBe('staging/');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * `organize.archive_destination` is derived from the taxonomy, not a
   * convention: defaulting it to the flat constant would send a PARA store's
   * archived notes to `archive/` while its own taxonomy declares `archives/`.
   */
  it('refuses a config that omits the taxonomy-derived archive destination', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = minimalConfig().replace('organize: { archive_destination: archives/ }\n', '');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  /** An opt-in whose absence means the store has no mission mechanism at all. */
  it('leaves mission_path unset rather than defaulting it', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), minimalConfig());
      const config = await readConfig(tmp.root);
      expect(config.organize.mission_path).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('harness.skills_path / procedures_path fallback (rename-procedures-to-skills)', () => {
  it('loads a schema-3 config that declares skills_path', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 3',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: .claude/skills/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('.claude/skills/');
      expect((config.harness as Record<string, unknown>).procedures_path).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('loads a schema-2 config that declares only the old procedures_path key', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 2',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('procedures/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('prefers skills_path when both keys are present', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 3',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: .claude/skills/, procedures_path: old-procedures/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('.claude/skills/');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * config-defaults-as-the-convention (D6): absent under BOTH spellings used
   * to raise a custom "run `ctxr migrate`" error, but an unmigrated store HAS
   * `procedures_path` and never reached it. What it actually rejected was a
   * config declining to name a skills path, which now takes the shipped one.
   */
  it('resolves the shipped skills path when neither key is present', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), minimalConfig());
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe(SHIPPED_DEFAULTS.harness.skills_path);
      expect(config.harness.guidance_path).toBe(SHIPPED_DEFAULTS.harness.guidance_path);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('adapters kind: forge / session.workspaces_external leniency (session-keeps-only-what-git-cannot-do D2)', () => {
  it('loads a schema-4 config still declaring a legacy forge adapter and workspaces_external, dropping both', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 4',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/, workspaces_external: true }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: skills/, guidance_path: guidance/ }',
        'adapters: [{ id: github, kind: forge }, { id: claude-code, kind: harness-generation }]',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.adapters).toEqual([{ id: 'claude-code', kind: 'harness-generation' }]);
      expect((config.session as Record<string, unknown>).workspaces_external).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('still rejects a genuinely unrecognized adapter kind', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 4',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: skills/, guidance_path: guidance/ }',
        'adapters: [{ id: something, kind: not-a-real-kind }]',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderStoreConfig (config-defaults-as-the-convention)', () => {
  async function resolved(text: string) {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      return await readConfig(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  }

  it('writes the store facts and omits every value equal to a shipped default', async () => {
    const rendered = renderStoreConfig(await resolved(minimalConfig()));

    expect(rendered).toContain('schema_version: 9');
    expect(rendered).toContain('default_branch: main');
    expect(rendered).toContain('archive_destination: archives/');
    for (const omitted of ['inbox_path', 'capture_root', 'exclude_paths', 'worktrees_path', 'section_max_bytes', 'vendored']) {
      expect(rendered, `${omitted} is a shipped default and should not be restated`).not.toContain(omitted);
    }
  });

  it('writes a key whose value differs from the shipped default', async () => {
    const rendered = renderStoreConfig(
      await resolved(`${minimalConfig()}ingest: { inbox_path: staging/inbox/, capture_root: staging/ }\n`),
    );
    expect(rendered).toContain('inbox_path: staging/inbox/');
    expect(rendered).toContain('capture_root: staging/');
    // Its sibling still matched, so it is still omitted.
    expect(rendered).not.toContain('tracking_params');
  });

  it('writes a reordered list rather than treating it as equal', async () => {
    const reversed = [...SHIPPED_DEFAULTS.retrieval.exclude_paths].reverse();
    const rendered = renderStoreConfig(
      await resolved(`${minimalConfig()}retrieval: { exclude_paths: [${reversed.join(', ')}] }\n`),
    );
    expect(rendered).toContain('exclude_paths:');
  });

  it('round-trips: what it writes resolves to what it was given', async () => {
    const config = await resolved(`${minimalConfig()}session: { branch_prefix: work/ }\n`);
    expect(await resolved(renderStoreConfig(config))).toEqual(config);
  });
});
