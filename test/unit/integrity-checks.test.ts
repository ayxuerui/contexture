import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adapterCompatibilityCheck,
  derivedArtifactStalenessCheck,
  graphDanglingLinksCheck,
  harnessEntryNoDuplicateConventionTextCheck,
  noUnrecognizedConfigKeysCheck,
  schemaVersionCurrencyCheck,
} from '../../src/core/checks/integrity-checks.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import type { AdapterDeclaration, StoreConfig } from '../../src/config/schema.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import type { GraphBuildResult } from '../../src/core/graph/model.js';
import type { Note } from '../../src/core/notes/list.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'lens' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
    ...overrides,
  };
}

function makeCtx(
  opts: { storeRoot?: string; notes?: Note[]; graph?: GraphBuildResult | null; config?: StoreConfig } = {},
): CheckContext {
  return {
    storeRoot: opts.storeRoot ?? '/fake/root',
    config: opts.config ?? makeConfig(),
    scope: 'store',
    git: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    notes: async () => opts.notes ?? [],
    graph: async () => opts.graph ?? null,
    catalog: async () => undefined,
  };
}

describe('graphDanglingLinksCheck', () => {
  it('is severity: invariant', () => {
    expect(graphDanglingLinksCheck.severity).toBe('invariant');
  });

  it('carries a different check id than the lint-facing broken_links observation', () => {
    expect(graphDanglingLinksCheck.id).toBe('graph.dangling_links');
    expect(graphDanglingLinksCheck.id).not.toBe('organize.broken_links');
  });

  it('skips when the graph has not been built', async () => {
    const result = await graphDanglingLinksCheck.run(makeCtx({ graph: null }));
    expect(result.status).toBe('skip');
  });

  it('fails, naming the link, when the graph has a dangling link', async () => {
    const graph: GraphBuildResult = {
      nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }],
      edges: [],
      dangling: [{ from: 'a.md', target: 'ghost', reason: 'not_found' }],
    };
    const result = await graphDanglingLinksCheck.run(makeCtx({ graph }));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('a.md');
  });

  it('passes when the graph has no dangling links', async () => {
    const graph: GraphBuildResult = { nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }], edges: [], dangling: [] };
    const result = await graphDanglingLinksCheck.run(makeCtx({ graph }));
    expect(result.status).toBe('pass');
  });
});

describe('schemaVersionCurrencyCheck', () => {
  it('is severity: invariant', () => {
    expect(schemaVersionCurrencyCheck.severity).toBe('invariant');
  });

  it('passes when the store is at the current schema version', async () => {
    const result = await schemaVersionCurrencyCheck.run(makeCtx({ config: makeConfig({ schema_version: SUPPORTED_SCHEMA_VERSION }) }));
    expect(result.status).toBe('pass');
  });

  it('fails, naming both versions, when the store is behind', async () => {
    const result = await schemaVersionCurrencyCheck.run(makeCtx({ config: makeConfig({ schema_version: 1 }) }));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.details).toEqual({ current: 1, supported: SUPPORTED_SCHEMA_VERSION });
  });
});

describe('adapterCompatibilityCheck', () => {
  it('is severity: invariant', () => {
    expect(adapterCompatibilityCheck.severity).toBe('invariant');
  });

  it('passes when every declared adapter resolves', async () => {
    const adapters: AdapterDeclaration[] = [{ id: 'github', kind: 'forge' }];
    const result = await adapterCompatibilityCheck.run(makeCtx({ config: makeConfig({ adapters }) }));
    expect(result.status).toBe('pass');
  });

  it('fails, naming the adapter, when a declared adapter does not resolve', async () => {
    const adapters: AdapterDeclaration[] = [{ id: 'nonexistent', kind: 'forge' }];
    const result = await adapterCompatibilityCheck.run(makeCtx({ config: makeConfig({ adapters }) }));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('nonexistent');
  });

  it('passes trivially when no adapters are declared', async () => {
    const result = await adapterCompatibilityCheck.run(makeCtx({ config: makeConfig({ adapters: [] }) }));
    expect(result.status).toBe('pass');
  });
});

describe('noUnrecognizedConfigKeysCheck', () => {
  it('is severity: invariant', () => {
    expect(noUnrecognizedConfigKeysCheck.severity).toBe('invariant');
  });

  it('passes for a config with only recognized top-level keys', async () => {
    const result = await noUnrecognizedConfigKeysCheck.run(makeCtx());
    expect(result.status).toBe('pass');
  });

  it('fails, naming the key, when the config carries a top-level key StoreConfigSchema no longer declares', async () => {
    const config = { ...makeConfig(), identity: { path: 'identity/', files: {}, entry_delimiter: '' } } as StoreConfig;
    const result = await noUnrecognizedConfigKeysCheck.run(makeCtx({ config }));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('identity');
    expect(result.findings[0]?.code).toBe('store.unrecognized_config_key');
  });

  it('names every unrecognized key when there is more than one', async () => {
    const config = { ...makeConfig(), identity: {}, some_future_typo: {} } as StoreConfig;
    const result = await noUnrecognizedConfigKeysCheck.run(makeCtx({ config }));
    expect(result.status).toBe('fail');
    expect(result.findings.map((f) => f.subject).sort()).toEqual(['identity', 'some_future_typo']);
  });
});

describe('derivedArtifactStalenessCheck', () => {
  it('is severity: invariant', () => {
    expect(derivedArtifactStalenessCheck.severity).toBe('invariant');
  });

  it('passes when neither the catalog nor the graph has ever been built', async () => {
    const result = await derivedArtifactStalenessCheck.run(makeCtx({ notes: [{ path: 'a.md', frontmatter: undefined, body: '' }] }));
    expect(result.status).toBe('pass');
  });

  it('fails when the persisted graph no longer matches a fresh rebuild', async () => {
    const notes: Note[] = [{ path: 'a.md', frontmatter: undefined, body: '' }, { path: 'b.md', frontmatter: undefined, body: '' }];
    const staleGraph: GraphBuildResult = { nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }], edges: [], dangling: [] }; // missing b.md
    const result = await derivedArtifactStalenessCheck.run(makeCtx({ notes, graph: staleGraph }));
    expect(result.status).toBe('fail');
    expect(result.findings.some((f) => f.code === 'derived_artifacts.graph_stale')).toBe(true);
  });

  it('passes when the persisted graph matches a fresh rebuild exactly', async () => {
    const notes: Note[] = [{ path: 'a.md', frontmatter: undefined, body: '' }];
    const freshGraph: GraphBuildResult = { nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }], edges: [], dangling: [] };
    const result = await derivedArtifactStalenessCheck.run(makeCtx({ notes, graph: freshGraph }));
    expect(result.status).toBe('pass');
  });
});

describe('harnessEntryNoDuplicateConventionTextCheck', () => {
  const claudeCodeAdapters: AdapterDeclaration[] = [{ id: 'claude-code', kind: 'harness-generation' }];

  it('is severity: invariant', () => {
    expect(harnessEntryNoDuplicateConventionTextCheck.severity).toBe('invariant');
  });

  it('passes trivially when no harness-generation adapter is configured', async () => {
    const result = await harnessEntryNoDuplicateConventionTextCheck.run(makeCtx({ config: makeConfig({ adapters: [] }) }));
    expect(result.status).toBe('pass');
  });

  it('skips when AGENTS.md has not been generated yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await harnessEntryNoDuplicateConventionTextCheck.run(
        makeCtx({ storeRoot: tmp.root, config: makeConfig({ adapters: claudeCodeAdapters }) }),
      );
      expect(result.status).toBe('skip');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes when the entry file carries only the managed import (harness-portability: "only imports")', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, 'AGENTS.md'), '# Entry doc\n\n## Store fundamentals\n\nSome canonical text.\n');
      await writeFile(
        path.join(tmp.root, 'CLAUDE.md'),
        '<!-- >>> contexture:adapter:claude-code:harness-entry (managed — do not edit) >>> -->\n' +
          '@AGENTS.md\n' +
          '<!-- <<< contexture:adapter:claude-code:harness-entry <<< -->\n',
      );
      const result = await harnessEntryNoDuplicateConventionTextCheck.run(
        makeCtx({ storeRoot: tmp.root, config: makeConfig({ adapters: claudeCodeAdapters }) }),
      );
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes when the extra content below the import is genuinely harness-specific', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, 'AGENTS.md'), '# Entry doc\n\n## Store fundamentals\n\nSome canonical text.\n');
      await writeFile(
        path.join(tmp.root, 'CLAUDE.md'),
        '<!-- >>> contexture:adapter:claude-code:harness-entry (managed — do not edit) >>> -->\n' +
          '@AGENTS.md\n' +
          '<!-- <<< contexture:adapter:claude-code:harness-entry <<< -->\n\n' +
          '## Claude Code specifics\n\nSkill auto-discovery notes.\n',
      );
      const result = await harnessEntryNoDuplicateConventionTextCheck.run(
        makeCtx({ storeRoot: tmp.root, config: makeConfig({ adapters: claudeCodeAdapters }) }),
      );
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails, naming the heading, when the entry file duplicates a section AGENTS.md already carries', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, 'AGENTS.md'), '# Entry doc\n\n## Store fundamentals\n\nSome canonical text.\n');
      await writeFile(
        path.join(tmp.root, 'CLAUDE.md'),
        '<!-- >>> contexture:adapter:claude-code:harness-entry (managed — do not edit) >>> -->\n' +
          '@AGENTS.md\n' +
          '<!-- <<< contexture:adapter:claude-code:harness-entry <<< -->\n\n' +
          '## Store fundamentals\n\nSome canonical text, copy-pasted.\n',
      );
      const result = await harnessEntryNoDuplicateConventionTextCheck.run(
        makeCtx({ storeRoot: tmp.root, config: makeConfig({ adapters: claudeCodeAdapters }) }),
      );
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.subject).toBe('CLAUDE.md');
      expect(result.findings[0]?.details).toEqual({ heading: 'store fundamentals' });
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not fail enumeration when a configured adapter has not generated its entry file at all', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, 'AGENTS.md'), '# Entry doc\n');
      const result = await harnessEntryNoDuplicateConventionTextCheck.run(
        makeCtx({ storeRoot: tmp.root, config: makeConfig({ adapters: claudeCodeAdapters }) }),
      );
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });
});
