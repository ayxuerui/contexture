import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { CHECKS } from '../../src/core/checks/manifest.js';
import { unsubstitutedPlaceholderCheck } from '../../src/core/checks/store-checks.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

function makeCtx(notes: Note[]): CheckContext {
  return {
    storeRoot: '/fake/root',
    config: makeConfig(),
    scope: 'store',
    git: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    notes: async () => notes,
    graph: async () => null,
    catalog: async () => undefined,
  };
}

describe('unsubstitutedPlaceholderCheck', () => {
  it('is an observation, so doctor never fails on it', () => {
    expect(unsubstitutedPlaceholderCheck.severity).toBe('observation');
    // The registry is what doctor and lint both dispatch off; severity is the
    // only thing separating them, so registration alone must not make it fatal.
    expect(CHECKS.map((c) => c.id)).toContain('store.unsubstituted_placeholder');
    expect(CHECKS.filter((c) => c.id === 'store.unsubstituted_placeholder' && c.severity === 'invariant')).toEqual([]);
  });

  it('reports a note whose body still carries a placeholder', async () => {
    const result = await unsubstitutedPlaceholderCheck.run(
      makeCtx([{ path: 'projects/a.md', frontmatter: undefined, body: '# {{title}}\n' }]),
    );
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('projects/a.md');
    expect(result.findings[0]?.details?.placeholders).toEqual(['{{title}}']);
  });

  it('reports a placeholder left in frontmatter, not only in the body', async () => {
    const result = await unsubstitutedPlaceholderCheck.run(
      makeCtx([{ path: 'projects/a.md', frontmatter: { date_created: '{{date}}' }, body: '# Real title\n' }]),
    );
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.details?.placeholders).toEqual(['{{date}}']);
  });

  it('ignores double-braced text outside the enumerated vocabulary', async () => {
    // Real notes carry other tools' syntax; reporting those trains operators to
    // ignore the finding.
    const result = await unsubstitutedPlaceholderCheck.run(
      makeCtx([
        { path: 'resources/a.md', frontmatter: undefined, body: '- {{embed ((680491b3-2324))}}\n' },
        { path: 'resources/b.md', frontmatter: undefined, body: '- TODO {{video https://example.com}}\n' },
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('passes a store with no notes at all', async () => {
    const result = await unsubstitutedPlaceholderCheck.run(makeCtx([]));
    expect(result.status).toBe('pass');
  });
});
