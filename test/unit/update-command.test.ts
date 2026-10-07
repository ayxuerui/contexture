import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as init } from '../../src/commands/init.js';
import { execute as update } from '../../src/commands/update.js';
import { isMap, isScalar, type Document } from 'yaml';
import { readConfig, readConfigMigrating } from '../../src/config/load.js';
import type { MigrationStep } from '../../src/config/migrations.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import { ContextureError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { MANAGED_SKILL_HEADER } from '../../src/core/skills.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

async function freshStore(root: string): Promise<{ store: Store; env: ReturnType<typeof makeFakeEnv> }> {
  const env = makeFakeEnv({ cwd: root, env: GIT_IDENTITY });
  await init(env, { root, profile: 'para' });
  return { store: { root, config: await readConfig(root) }, env };
}

describe('ctxr update', () => {
  it('reports nothing changed on a store that is already current', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      // init-generates-harness-adapter-output: a freshly initialized store is
      // already current, adapter outputs included, so the first update is a no-op.
      const outcome = await update(env, store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.changed).toEqual([]);
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports nothing changed after an init that selected no harness, and writes no entry file', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: GIT_IDENTITY });
      await init(env, { root: tmp.root, profile: 'para', harness: 'none' });
      const store: Store = { root: tmp.root, config: await readConfig(tmp.root) };
      const outcome = await update(env, store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.changed).toEqual([]);
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refreshes a drifted ctxr-owned skill copy and a stale generated AGENTS.md section', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const skillPath = path.join(tmp.root, '.agents/skills/ctxr-placement/SKILL.md');
      await writeFile(skillPath, 'stale copy from an older contexture\n');
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      await writeFile(agentsPath, (await readFile(agentsPath, 'utf8')).replaceAll('`ctxr ', '`contexture '));

      const outcome = await update(env, store);
      expect(outcome.data?.changed).toContain('.agents/skills/ctxr-placement/SKILL.md');
      expect(outcome.data?.changed).toContain('AGENTS.md');
      expect(await readFile(skillPath, 'utf8')).toContain(MANAGED_SKILL_HEADER);
      const agents = await readFile(agentsPath, 'utf8');
      expect(agents).not.toContain('`contexture ');
      expect(agents).toContain('`ctxr session start`');
      expect(await update(env, store)).toMatchObject({ data: { changed: [] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes a pre-existing store\'s orphaned "agent identity" AGENTS.md section (retired by remove-agent-identity)', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      const before = await readFile(agentsPath, 'utf8');
      const orphanedFence = [
        '',
        '<!-- >>> contexture:agent-identity (managed — do not edit) >>> -->',
        '## Agent identity',
        '',
        'Load at session start: `.contexture/identity/posture.md`.',
        '<!-- <<< contexture:agent-identity <<< -->',
      ].join('\n');
      await writeFile(agentsPath, `${before.replace(/\n$/, '')}${orphanedFence}\n`);

      const outcome = await update(env, store);
      expect(outcome.data?.changed).toContain('AGENTS.md');
      const after = await readFile(agentsPath, 'utf8');
      expect(after).not.toContain('agent-identity');
      expect(after).not.toContain('Agent identity');
      expect(after).toBe(before);
      // Idempotent: a store with no orphaned fence left to remove reports no further AGENTS.md change from this step.
      expect(await update(env, store)).toMatchObject({ data: { changed: [] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('never rewrites operator content: an operator skill survives an update', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      await mkdir(path.join(tmp.root, '.agents/skills/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, '.agents/skills/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      await update(env, store);
      expect(await readFile(path.join(tmp.root, '.agents/skills/mine/SKILL.md'), 'utf8')).toBe('---\nname: mine\n---\nmine\n');
    } finally {
      await tmp.cleanup();
    }
  });
});

/**
 * migrate-stores-on-update: `ctxr update` carries an older store forward. The shipped ladder is
 * empty, so a test ladder stands in: one step from v-1 that renames `git.legacy_default_branch`
 * back to `git.default_branch` in place.
 */
describe('ctxr update migrates an older store', () => {
  const v = SUPPORTED_SCHEMA_VERSION;

  function renameIn(doc: Document, block: string, from: string, to: string): void {
    const map = doc.getIn([block], true);
    if (!isMap(map)) throw new Error(`no ${block} block`);
    const pair = map.items.find((item) => isScalar(item.key) && item.key.value === from);
    if (!pair || !isScalar(pair.key)) throw new Error(`no ${block}.${from}`);
    pair.key.value = to;
  }

  const renameLegacyBranch: MigrationStep = {
    from: v - 1,
    retires: ['git.legacy_default_branch'],
    apply: (doc) => renameIn(doc, 'git', 'legacy_default_branch', 'default_branch'),
  };

  /** A freshly initialized store, rewound to look like it was written one schema version ago. */
  async function olderStore(root: string): Promise<{ env: ReturnType<typeof makeFakeEnv>; current: string; older: string }> {
    const { env } = await freshStore(root);
    const configPath = path.join(root, 'contexture.yaml');
    // A comment the operator added: a migration must carry it across untouched.
    const current = (await readFile(configPath, 'utf8')).replace('git:\n', 'git:\n  # the operator chose this branch\n');
    const older = current
      .replace(`schema_version: ${v}`, `schema_version: ${v - 1}`)
      .replace('  default_branch:', '  legacy_default_branch:');
    expect(older).not.toBe(current);
    await writeFile(configPath, older);
    return { env, current, older };
  }

  it('writes the migrated configuration, then reconciles', async () => {
    const tmp = await makeTmpDir();
    try {
      const { env, current } = await olderStore(tmp.root);
      const read = await readConfigMigrating(tmp.root, [renameLegacyBranch]);
      expect(read.migratedFrom).toBe(v - 1);

      const outcome = await update(env, { root: tmp.root, ...read });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.migrated).toEqual({ from: v - 1, to: v });
      expect(outcome.data?.changed).toContain('contexture.yaml');
      // Byte-for-byte the current-version file: only the renamed key and the version moved, and
      // the operator's comment, every other key and their order are as they were.
      expect(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).toBe(current);
      // …and the store now opens through the ordinary gate.
      expect((await readConfig(tmp.root)).schema_version).toBe(v);
    } finally {
      await tmp.cleanup();
    }
  });

  it('adds no key the store left to its shipped default', async () => {
    const tmp = await makeTmpDir();
    try {
      const { env } = await olderStore(tmp.root);
      const read = await readConfigMigrating(tmp.root, [renameLegacyBranch]);
      await update(env, { root: tmp.root, ...read });
      const written = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      // init omits every defaulted block; the migration must not materialize one.
      expect(written).not.toMatch(/^session:/m);
      expect(written).not.toMatch(/^update_check:/m);
      expect(written).not.toMatch(/^derived:/m);
    } finally {
      await tmp.cleanup();
    }
  });

  it('writes nothing when a step fails, naming the step', async () => {
    const tmp = await makeTmpDir();
    try {
      const { older } = await olderStore(tmp.root);
      const failing: MigrationStep = {
        from: v - 1,
        retires: [],
        apply: () => {
          throw new Error('cannot carry this store');
        },
      };
      const err = await readConfigMigrating(tmp.root, [failing]).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ContextureError);
      expect((err as ContextureError).exitCode).toBe(ExitCode.Usage);
      expect((err as ContextureError).finding.code).toBe('config.schema_version.migration_failed');
      expect((err as ContextureError).finding.message).toContain(`step ${v - 1} -> ${v}`);
      expect(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).toBe(older);
    } finally {
      await tmp.cleanup();
    }
  });

  it('writes nothing when the migrated configuration does not validate', async () => {
    const tmp = await makeTmpDir();
    try {
      const { older } = await olderStore(tmp.root);
      // A step that "forgets" the rename leaves git.default_branch missing — a required store fact.
      const incomplete: MigrationStep = { from: v - 1, retires: [], apply: () => undefined };
      const err = await readConfigMigrating(tmp.root, [incomplete]).catch((e: unknown) => e);
      expect((err as ContextureError).finding.code).toBe('config.schema_version.migration_failed');
      expect((err as ContextureError).finding.message).toContain('does not validate');
      expect(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).toBe(older);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves contexture.yaml byte-identical for a store already at the supported version', async () => {
    const tmp = await makeTmpDir();
    try {
      const { env } = await freshStore(tmp.root);
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const before = await readFile(configPath, 'utf8');
      const read = await readConfigMigrating(tmp.root, [renameLegacyBranch]);
      expect(read.migratedFrom).toBeNull();
      const outcome = await update(env, { root: tmp.root, ...read });
      expect(outcome.data?.migrated).toBeUndefined();
      expect(outcome.data?.changed).not.toContain('contexture.yaml');
      expect(await readFile(configPath, 'utf8')).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });
});
