import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

/** Task 6.7's literal verification. */
describe('contexture ingest / source (real CLI)', () => {
  it('ingesting the same fixture source twice yields already-ingested on the second check, with zero additional writes', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'inbox/a.md', '# Fixture\n\nCaptured content.\n');

      const ingested = await runCli(['ingest', 'inbox/a.md', '--source-type', 'web', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(ingested.exitCode).toBe(0);

      const secondCheck = await runCli(['source', 'check', 'inbox/a.md', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(secondCheck.exitCode).toBe(0);
      expect(JSON.parse(secondCheck.stdout).data.verdict).toBe('already_ingested');

      // Re-ingesting the same, already-identified file is refused rather than silently re-stamped.
      const reingest = await runCli(['ingest', 'inbox/a.md', '--source-type', 'web', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(reingest.exitCode).not.toBe(0);
      expect(JSON.parse(reingest.stdout).findings[0].code).toBe('ingest.already_ingested');
    } finally {
      await tmp.cleanup();
    }
  });

  it('two independent notes with genuinely different source-ids but identical canonicalized content are reported as an alternate-source match, not silently merged', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'inbox/a.md', '# Same content\n\nIdentical text.\n');
      await runCli(['ingest', 'inbox/a.md', '--source-type', 'web', '--source-id', 'src-a', '--json'], {
        cwd: tmp.root,
        env,
      });

      await writeNote(tmp.root, 'inbox/b.md', '# Same content\n\nIdentical text.\n');
      const check = await runCli(['source', 'check', 'inbox/b.md', '--source-id', 'src-b', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(check.exitCode).toBe(0);
      const data = JSON.parse(check.stdout).data;
      expect(data.verdict).toBe('alternate_source_match');
      expect(data.matches).toEqual(['inbox/a.md']);

      // Ingesting b anyway is a deliberate caller decision, not something source check does on its own.
      const ingestB = await runCli(['ingest', 'inbox/b.md', '--source-type', 'web', '--source-id', 'src-b', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(ingestB.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('editing a note body after ingest and re-checking the same original source does not report content drift', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'inbox/a.md', '# Original\n\nOriginal body.\n');
      await runCli(['ingest', 'inbox/a.md', '--source-type', 'web', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });

      // Someone hand-edits the ingested note afterward.
      await writeNote(
        tmp.root,
        'inbox/a.md',
        (await import('node:fs/promises').then((m) => m.readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8'))).replace(
          'Original body.',
          'Edited body, different from what was ingested.',
        ),
      );

      // Re-checking the ORIGINAL captured material against the same source-id still matches at
      // the source-id stage — it never re-derives a hash from the note's current, edited body.
      await writeNote(tmp.root, 'inbox/recaptured.md', '# Original\n\nOriginal body.\n');
      const recheck = await runCli(['source', 'check', 'inbox/recaptured.md', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(recheck.exitCode).toBe(0);
      const data = JSON.parse(recheck.stdout).data;
      expect(data.verdict).toBe('already_ingested');
      expect(data.stage).toBe('source_id');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a captured (not-yet-ingested) inbox file carries no source-identity fields', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'inbox/a.md', '# Just captured\n\nNo identity yet.\n');

      const { readFile } = await import('node:fs/promises');
      const content = await readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8');
      expect(content).not.toMatch(/source_type|source_id|source_hash|^ingested:/m);
    } finally {
      await tmp.cleanup();
    }
  });

  it('successful ingest leaves catalog check green for the resulting note', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'inbox/a.md', '# New\n\nContent.\n');
      await runCli(['ingest', 'inbox/a.md', '--source-type', 'web', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });

      const check = await runCli(['catalog', 'check', '--json'], { cwd: tmp.root, env });
      expect(check.exitCode).toBe(0);
      expect(JSON.parse(check.stdout).data.missing).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('source check and catalog check --stale compute identical hashes for identical content (task 6.2: one shared primitive)', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', '# Note\n\nSome content.\n');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });

      const hashResult = await runCli(['source', 'hash', 'projects/a.md', '--json'], { cwd: tmp.root, env });
      const sourceHash = JSON.parse(hashResult.stdout).data.hash;

      // catalog build freezes the confirmed hash the first time a gloss becomes non-empty.
      const { readFile, writeFile: write } = await import('node:fs/promises');
      const catalogPath = path.join(tmp.root, '.contexture/catalog', 'projects.md');
      const withGloss = (await readFile(catalogPath, 'utf8')).replace(') — ', ') — a gloss');
      await write(catalogPath, withGloss);
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      const frozen = await readFile(catalogPath, 'utf8');
      const hashInCatalog = /<!-- hash:([0-9a-f]{16}) -->/.exec(frozen)?.[1];

      expect(hashInCatalog).toBe(sourceHash);
    } finally {
      await tmp.cleanup();
    }
  });
});
