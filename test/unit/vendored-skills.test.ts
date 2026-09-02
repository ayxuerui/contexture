import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncVendoredSkills, VENDORED_PROVENANCE_FILE_NAME, type VendoredProvenance } from '../../src/core/skills.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const CTXR_VERSION = '9.9.9-test';

function makeConfig(vendored: string[] = ['frontend-design']): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: '.agents/skills/', guidance_path: 'guidance/' },
    adapters: [],
  };
}

function skillDir(root: string): string {
  return path.join(root, '.agents/skills/frontend-design');
}

describe('syncVendoredSkills', () => {
  it('writes SKILL.md, LICENSE.txt, and a provenance record on first run', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await syncVendoredSkills(tmp.root, makeConfig(), CTXR_VERSION);
      expect(result.findings).toEqual([]);
      expect(result.changed.sort()).toEqual(
        [
          '.agents/skills/frontend-design/SKILL.md',
          '.agents/skills/frontend-design/LICENSE.txt',
          `.agents/skills/frontend-design/${VENDORED_PROVENANCE_FILE_NAME}`,
        ].sort(),
      );

      const dir = skillDir(tmp.root);
      const skillMd = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
      expect(skillMd).toContain('name: frontend-design');
      await expect(readFile(path.join(dir, 'LICENSE.txt'), 'utf8')).resolves.toContain('Apache License');

      const provenance = JSON.parse(await readFile(path.join(dir, VENDORED_PROVENANCE_FILE_NAME), 'utf8')) as VendoredProvenance;
      expect(provenance.source).toBe('anthropics/skills');
      expect(provenance.license).toBe('Apache-2.0');
      expect(provenance.ctxrVersion).toBe(CTXR_VERSION);
      expect(provenance.sha256).toHaveLength(64);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is idempotent: a second run writes nothing and reports no findings', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await syncVendoredSkills(tmp.root, config, CTXR_VERSION);
      const second = await syncVendoredSkills(tmp.root, config, CTXR_VERSION);
      expect(second).toEqual({ changed: [], findings: [] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves a locally modified skill and reports it, never overwriting', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await syncVendoredSkills(tmp.root, config, CTXR_VERSION);

      const skillMdPath = path.join(skillDir(tmp.root), 'SKILL.md');
      const edited = `${await readFile(skillMdPath, 'utf8')}\n\nAn operator note.\n`;
      await writeFile(skillMdPath, edited, 'utf8');

      const result = await syncVendoredSkills(tmp.root, config, CTXR_VERSION);
      expect(result.changed).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.code).toBe('skills.vendored_locally_modified');
      expect(result.findings[0]?.subject).toBe('frontend-design');

      expect(await readFile(skillMdPath, 'utf8')).toBe(edited);
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes an unmodified vendored skill when the store opts out', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncVendoredSkills(tmp.root, makeConfig(), CTXR_VERSION);
      const result = await syncVendoredSkills(tmp.root, makeConfig([]), CTXR_VERSION);

      expect(result.changed).toEqual(['.agents/skills/frontend-design']);
      expect(result.findings).toEqual([]);
      await expect(readFile(path.join(skillDir(tmp.root), 'SKILL.md'), 'utf8')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('never writes over an operator-authored directory carrying no provenance record', async () => {
    const tmp = await makeTmpDir();
    try {
      const dir = skillDir(tmp.root);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), '---\nname: frontend-design\ndescription: mine\n---\nmine\n', 'utf8');

      const result = await syncVendoredSkills(tmp.root, makeConfig(), CTXR_VERSION);
      expect(result.changed).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(await readFile(path.join(dir, 'SKILL.md'), 'utf8')).toBe('---\nname: frontend-design\ndescription: mine\n---\nmine\n');
      await expect(readFile(path.join(dir, VENDORED_PROVENANCE_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not delete a locally modified skill on opt-out, and reports it', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncVendoredSkills(tmp.root, makeConfig(), CTXR_VERSION);
      const skillMdPath = path.join(skillDir(tmp.root), 'SKILL.md');
      await writeFile(skillMdPath, `${await readFile(skillMdPath, 'utf8')}\n\nedited\n`, 'utf8');

      const result = await syncVendoredSkills(tmp.root, makeConfig([]), CTXR_VERSION);
      expect(result.changed).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.subject).toBe('frontend-design');
      expect(await readFile(skillMdPath, 'utf8')).toContain('edited');
    } finally {
      await tmp.cleanup();
    }
  });
});
