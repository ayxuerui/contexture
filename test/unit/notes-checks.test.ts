import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { failClosedVisibilityCheck } from '../../src/core/notes/checks.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import { runChecks } from '../../src/core/checks/registry.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
  } as StoreConfig;
}

function makeCtx(notes: Note[], config: StoreConfig = makeConfig()): CheckContext {
  return {
    storeRoot: '/fake/root',
    config,
    scope: 'store',
    notes: async () => notes,
    graph: async () => undefined,
    catalog: async () => undefined,
  };
}

describe('failClosedVisibilityCheck', () => {
  it('is severity: observation, never invariant', () => {
    expect(failClosedVisibilityCheck.severity).toBe('observation');
  });

  it('passes with no findings when every note has an explicit or directory-derived visibility', async () => {
    const ctx = makeCtx([{ path: 'a.md', frontmatter: { scope: 'shared' }, body: '' }]);
    const result = await failClosedVisibilityCheck.run(ctx);
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('flags each note relying on the fail-closed default, naming it', async () => {
    const ctx = makeCtx([
      { path: 'a.md', frontmatter: { scope: 'shared' }, body: '' },
      { path: 'b.md', frontmatter: undefined, body: '' },
    ]);
    const result = await failClosedVisibilityCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toBe('b.md');
  });

  it('never affects doctor (severity: invariant filter excludes it)', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityCheck], ctx, {
      scope: 'store',
      severity: 'invariant',
    });
    expect(reports).toEqual([]);
  });

  it('is selectable via an observation-severity filter', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityCheck], ctx, {
      scope: 'store',
      severity: 'observation',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.result.status).toBe('fail');
  });
});
