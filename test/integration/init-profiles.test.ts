import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { SHIPPED_PROFILES } from '../../src/taxonomy/profiles.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const FIXTURE_TAXONOMY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/taxonomy/custom-runbook.yaml',
);

describe('init taxonomy selection (non-prompt paths)', () => {
  it('--profile zettelkasten writes a taxonomy with no layers', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--profile', 'zettelkasten', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.taxonomy.layers).toEqual([]);
      expect(data.taxonomy.profile).toBe('zettelkasten');

      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      for (const profile of SHIPPED_PROFILES) {
        if (profile.id === 'zettelkasten') continue;
        for (const layer of profile.layers) expect(configText).not.toContain(layer.name);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('--taxonomy writes the custom definition, with no shipped profile layer names present', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--taxonomy', FIXTURE_TAXONOMY, '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.taxonomy.profile).toBeNull();
      expect(data.taxonomy.layers.map((l: { name: string }) => l.name)).toEqual([
        'Services',
        'Runbooks',
        'Incidents',
      ]);

      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      for (const profile of SHIPPED_PROFILES) {
        for (const layer of profile.layers) expect(configText).not.toContain(layer.name);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it("a fresh store takes its archive destination from the profile, defaulting only when the profile declares none", async () => {
    // archive-destination-from-taxonomy: PARA declares a retirement layer, so a
    // PARA store must never be born pointing at `archive/` — a directory its own
    // taxonomy doesn't have. Diataxis declares none, so it keeps the fallback.
    for (const [profile, expected] of [
      ['para', 'archives/'],
      ['diataxis', 'archive/'],
      ['zettelkasten', 'archive/'],
    ] as const) {
      const tmp = await makeTmpDir();
      try {
        const env = hermeticGitEnv();
        const result = await runCli(['init', '--profile', profile], { cwd: tmp.root, env });
        expect(result.exitCode, `${profile}: ${result.stderr}`).toBe(0);

        const config = await readConfig(tmp.root);
        expect(config.organize.archive_destination, `profile ${profile}`).toBe(expected);

        const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
        expect(configText).not.toContain('archive_path');
      } finally {
        await tmp.cleanup();
      }
    }
  });

  it('a custom taxonomy falls back to the default archive destination', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--taxonomy', FIXTURE_TAXONOMY], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      expect((await readConfig(tmp.root)).organize.archive_destination).toBe('archive/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('--profile and --taxonomy together exit 2 naming the conflict', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(
        ['init', '--profile', 'para', '--taxonomy', FIXTURE_TAXONOMY, '--json'],
        { cwd: tmp.root, env },
      );
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('taxonomy.selection_conflict');
    } finally {
      await tmp.cleanup();
    }
  });

  it('an unknown --profile exits 2, listing known profiles', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--profile', 'nonexistent', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('taxonomy.unknown_profile');
      expect((parsed.findings[0].details.knownIds as string[]).sort()).toEqual([
        'diataxis',
        'para',
        'zettelkasten',
      ]);
    } finally {
      await tmp.cleanup();
    }
  });
});
