import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_ROOT, DEFAULT_PUBLISH_PATH, DEFAULT_VENDORED_SKILLS, SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { readConfig } from '../../src/config/load.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import { renderStoreConfig } from '../../src/config/render.js';
import { InvalidConfigError, SchemaVersionMissingError, SchemaVersionNewerError } from '../../src/core/errors.js';
import { CONFIG_FILE_NAME } from '../../src/core/root.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/config');

function captureTierConfig(inboxPath: string, captureRoot: string | null): string {
  const ingest = captureRoot === null ? `{ inbox_path: ${inboxPath} }` : `{ inbox_path: ${inboxPath}, capture_root: ${captureRoot} }`;
  return [
    `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
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
    `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
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
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), `schema_version: ${SUPPORTED_SCHEMA_VERSION}\ntaxonomy: "not an object"\n`);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves mission_path undefined when the key is not declared', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
        'taxonomy: { profile: para, layers: [] }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'ingest: { inbox_path: raw/inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: skills/ }',
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
        `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
        'taxonomy: { profile: para, layers: [] }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'ingest: { inbox_path: raw/inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: skills/ }',
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
        `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
        'taxonomy: { profile: para, layers: [] }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'ingest: { inbox_path: raw/inbox/ }',
        'organize: { archive_destination: archive/ }',
        'harness: { skills_path: skills/ }',
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
        `schema_version: ${SUPPORTED_SCHEMA_VERSION}`,
        'taxonomy: { profile: para, layers: [] }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'ingest: { inbox_path: raw/inbox/ }',
        'organize: { archive_destination: archive/ }',
        "identity: { path: identity/, files: {}, entry_delimiter: '' }",
        'harness: { skills_path: skills/ }',
        'adapters: []',
        'a_future_section: { anything: true }',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(SUPPORTED_SCHEMA_VERSION);
    } finally {
      await tmp.cleanup();
    }
  });

  it('fills in the shipped capture root when a config declares only an inbox', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig('raw/inbox/', null));
      const config = await readConfig(tmp.root);
      expect(config.ingest.capture_root).toBe(DEFAULT_CAPTURE_ROOT);
      expect(config.ingest.inbox_path).toBe('raw/inbox/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses an inbox that is not inside the declared capture root, naming both values', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig('inbox/', 'raw/'));
      await expect(readConfig(tmp.root)).rejects.toThrow(/"inbox\/".*capture_root.*"raw\/"/);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses an inbox that merely equals the capture root', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig('raw/', 'raw/'));
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts an inbox nested inside the declared capture root', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), captureTierConfig('raw/inbox/', 'raw/'));
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
      expect(config.templates.path).toBe(SHIPPED_DEFAULTS.templates.path);
      expect(config.templates.installed).toEqual([...SHIPPED_DEFAULTS.templates.installed]);
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

/**
 * standardize-note-templates: the `templates` block is additive with shipped
 * defaults, which is what lets it reach an existing store with no schema bump.
 */
describe('templates block (standardize-note-templates)', () => {
  it('resolves both keys to their defaults when a pre-existing config declares no templates key', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), minimalConfig());
      const config = await readConfig(tmp.root);
      expect(config.templates.path).toBe(SHIPPED_DEFAULTS.templates.path);
      expect(config.templates.installed).toEqual([...SHIPPED_DEFAULTS.templates.installed]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('takes a declared path and a declared list over the shipped defaults', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = `${minimalConfig()}templates: { path: scaffolds/, installed: [Note] }\n`;
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.templates.path).toBe('scaffolds/');
      expect(config.templates.installed).toEqual(['Note']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts an empty installed list as an explicit opt-out', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = `${minimalConfig()}templates: { installed: [] }\n`;
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.templates.installed).toEqual([]);
      expect(config.templates.path).toBe(SHIPPED_DEFAULTS.templates.path);
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

    expect(rendered).toContain(`schema_version: ${SUPPORTED_SCHEMA_VERSION}`);
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

describe('adapters', () => {
  it('rejects an unrecognized adapter kind', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = `${minimalConfig()}adapters: [{ id: something, kind: not-a-real-kind }]\n`;
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * retire-store-migrations D8: `skills_dir` used to be stripped before it
   * reached `AdapterDeclarationSchema`, because the forge pre-filter object
   * did not declare it and zod strips unknown keys. The override was dead
   * config — declared in the schema, read by `effectiveSkillsDir`, and
   * unreachable from a `contexture.yaml`. This is the regression guard.
   */
  it('preserves a declared skills_dir through config loading', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = `${minimalConfig()}adapters: [{ id: hermes-agent, kind: harness-generation, skills_dir: .agents/skills/ }]\n`;
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.adapters[0]?.skills_dir).toBe('.agents/skills/');
    } finally {
      await tmp.cleanup();
    }
  });
});
