import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/session-capture.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { InvalidCaptureProposalError } from '../../src/core/errors.js';
import { parseNote } from '../../src/core/notes/parse.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Areas', path: 'areas', description: 'Ongoing responsibilities.' }] },
    derived: { paths: ['.contexture/cache/'] },
    retrieval: { exclude_paths: ['.contexture/'], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

async function writeProposal(dir: string, yaml: string): Promise<string> {
  const proposalPath = path.join(dir, 'proposal.yaml');
  await writeFile(proposalPath, yaml);
  return proposalPath;
}

describe('ctxr session capture (session-capture-command D1/D2)', () => {
  it('writes every valid note, refuses a bad one by reason, and exits non-zero naming it', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(
        tmp.root,
        [
          'notes:',
          '  - id: A1',
          '    path: areas/one.md',
          '    mode: create',
          '    body: "# One\\n"',
          '  - id: A2',
          '    path: ../escape.md',
          '    mode: create',
          '    body: "# Escape\\n"',
          '  - id: A3',
          '    path: areas/two.md',
          '    mode: create',
          '    body: "# Two\\n"',
        ].join('\n'),
      );

      const outcome = await execute(store, { proposal: proposalPath });

      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.items).toEqual([
        { id: 'A1', path: 'areas/one.md', outcome: 'wrote' },
        { id: 'A2', path: '../escape.md', outcome: 'refused', reason: 'resolves outside the store' },
        { id: 'A3', path: 'areas/two.md', outcome: 'wrote' },
      ]);
      expect(await readFile(path.join(tmp.root, 'areas/one.md'), 'utf8')).toBe('# One\n');
      expect(await readFile(path.join(tmp.root, 'areas/two.md'), 'utf8')).toBe('# Two\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('append preserves the note\'s prior bytes exactly, with the new content following them', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
      await writeFile(path.join(tmp.root, 'areas/existing.md'), '---\nscope: shared\n---\n# Existing\n\noriginal content\n');

      const proposalPath = await writeProposal(
        tmp.root,
        ['notes:', '  - id: A1', '    path: areas/existing.md', '    mode: append', '    body: "new content"'].join('\n'),
      );
      const outcome = await execute(store, { proposal: proposalPath });

      expect(outcome.exitCode).toBe(ExitCode.Ok);
      const text = await readFile(path.join(tmp.root, 'areas/existing.md'), 'utf8');
      expect(text).toBe('---\nscope: shared\n---\n# Existing\n\noriginal content\nnew content');
      expect(text.startsWith('---\nscope: shared\n---\n# Existing\n\noriginal content\n')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is not idempotent by design: running the same append proposal twice appends twice', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
      await writeFile(path.join(tmp.root, 'areas/existing.md'), '# Existing\n');

      const proposalPath = await writeProposal(
        tmp.root,
        ['notes:', '  - id: A1', '    path: areas/existing.md', '    mode: append', '    body: "new content"'].join('\n'),
      );

      const first = await execute(store, { proposal: proposalPath });
      expect(first.data?.items[0]).toMatchObject({ outcome: 'appended' });
      const second = await execute(store, { proposal: proposalPath });
      expect(second.data?.items[0]).toMatchObject({ outcome: 'appended' });

      const text = await readFile(path.join(tmp.root, 'areas/existing.md'), 'utf8');
      expect(text).toBe('# Existing\nnew content\nnew content');
    } finally {
      await tmp.cleanup();
    }
  });

  it('append refuses when the target does not exist, without touching anything', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(
        tmp.root,
        ['notes:', '  - id: A1', '    path: areas/missing.md', '    mode: append', '    body: "x"'].join('\n'),
      );
      const outcome = await execute(store, { proposal: proposalPath });
      expect(outcome.data?.items[0]).toMatchObject({ outcome: 'refused', reason: 'append target does not exist' });
    } finally {
      await tmp.cleanup();
    }
  });

  it('create refuses when the target already exists, without clobbering it', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
      await writeFile(path.join(tmp.root, 'areas/existing.md'), 'original\n');

      const proposalPath = await writeProposal(
        tmp.root,
        ['notes:', '  - id: A1', '    path: areas/existing.md', '    mode: create', '    body: "clobber"'].join('\n'),
      );
      const outcome = await execute(store, { proposal: proposalPath });
      expect(outcome.data?.items[0]).toMatchObject({ outcome: 'refused', reason: 'already exists; use mode: append' });
      expect(await readFile(path.join(tmp.root, 'areas/existing.md'), 'utf8')).toBe('original\n');
    } finally {
      await tmp.cleanup();
    }
  });

  // retire-the-access-axes (write-lifecycle delta): a proposal still carrying
  // the retired `visibility:` key has it IGNORED, not refused — the item is
  // written normally and no visibility key is stamped onto the note.
  it('ignores a retired visibility key on a proposal item rather than refusing the item', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(
        tmp.root,
        ['notes:', '  - id: A1', '    path: areas/scoped.md', '    mode: create', '    visibility: ctx-a', '    body: "# Scoped\\n"'].join(
          '\n',
        ),
      );
      const result = await execute(store, { proposal: proposalPath });
      expect(result.data?.items).toEqual([{ id: 'A1', path: 'areas/scoped.md', outcome: 'wrote' }]);

      const note = await parseNote(path.join(tmp.root, 'areas/scoped.md'), 'areas/scoped.md');
      expect(note.frontmatter?.scope).toBeUndefined();
      expect(note.frontmatter?.visibility).toBeUndefined();
      expect(note.frontmatter?.lens).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('rejects a non-object top-level proposal (e.g. a bare scalar) instead of silently treating it as empty', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(tmp.root, 'false');

      await expect(execute(store, { proposal: proposalPath })).rejects.toBeInstanceOf(InvalidCaptureProposalError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('rejects a proposal declaring world_facts or user_facts rather than silently ignoring them', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(
        tmp.root,
        ['world_facts:', '  - id: B1', '    action: add', '    text: "a fact"'].join('\n'),
      );

      await expect(execute(store, { proposal: proposalPath })).rejects.toBeInstanceOf(InvalidCaptureProposalError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('an unreadable proposal file fails the whole command with a distinct error', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(execute(store, { proposal: path.join(tmp.root, 'nonexistent.yaml') })).rejects.toBeInstanceOf(
        InvalidCaptureProposalError,
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('never scans or infers beyond the proposal: an empty proposal writes nothing and reports zero items', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const proposalPath = await writeProposal(tmp.root, '{}');
      const outcome = await execute(store, { proposal: proposalPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.items).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
