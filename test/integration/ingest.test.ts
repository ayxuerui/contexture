import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

/** The month directory ingest retains into, derived the same way ingest does. */
function ledgerMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('contexture ingest / source (real CLI)', () => {
  it('retains the capture, cites it from the note, and refuses a second ingest of it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Fixture\n\nCaptured content.\n');
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n\nWhat the store knows.\n');

      const ingested = await runCli(
        ['ingest', 'raw/inbox/a.md', '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-1', '--json'],
        { cwd: tmp.root, env },
      );
      expect(ingested.exitCode).toBe(0);
      const retained = JSON.parse(ingested.stdout).data.capture as string;
      expect(retained).toBe(`raw/${ledgerMonth()}/a.md`);

      // The capture survived and left the inbox; the note cites it.
      expect(await readFile(path.join(tmp.root, retained), 'utf8')).toContain('source_id: src-1');
      expect(await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8')).toContain(retained);

      const secondCheck = await runCli(['source', 'check', retained, '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(secondCheck.exitCode).toBe(0);
      expect(JSON.parse(secondCheck.stdout).data.verdict).toBe('already_ingested');

      const reingest = await runCli(
        ['ingest', retained, '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-1', '--json'],
        { cwd: tmp.root, env },
      );
      expect(reingest.exitCode).not.toBe(0);
      expect(JSON.parse(reingest.stdout).findings[0].code).toBe('ingest.already_ingested');
    } finally {
      await tmp.cleanup();
    }
  });

  it('two captures with different source-ids but identical content are an alternate-source match, not a silent merge', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n');
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Same content\n\nIdentical text.\n');
      const first = await runCli(
        ['ingest', 'raw/inbox/a.md', '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-a', '--json'],
        { cwd: tmp.root, env },
      );
      const retainedA = JSON.parse(first.stdout).data.capture as string;

      await writeNote(tmp.root, 'raw/inbox/b.md', '# Same content\n\nIdentical text.\n');
      const check = await runCli(['source', 'check', 'raw/inbox/b.md', '--source-id', 'src-b', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(check.exitCode).toBe(0);
      const data = JSON.parse(check.stdout).data;
      expect(data.verdict).toBe('alternate_source_match');
      expect(data.matches).toEqual([retainedA]);

      // The verdict is advisory: a deliberate ingest of the same content under its own identity still works.
      const ingestB = await runCli(
        ['ingest', 'raw/inbox/b.md', '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-b', '--json'],
        { cwd: tmp.root, env },
      );
      expect(ingestB.exitCode).toBe(0);

      // Both captures are cited; neither replaced the other.
      const note = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(note).toContain(retainedA);
      expect(note).toContain(JSON.parse(ingestB.stdout).data.capture);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports drift when the same source identity turns up with moved content', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n');
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Original\n\nOriginal body.\n');
      await runCli(
        ['ingest', 'raw/inbox/a.md', '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-1', '--json'],
        { cwd: tmp.root, env },
      );

      // The note is rewritten freely — that must not read as the source drifting.
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n\nHeavily rewritten synthesis.\n');
      await writeNote(tmp.root, 'raw/inbox/recaptured.md', '# Original\n\nThe source has since changed.\n');
      const recheck = await runCli(['source', 'check', 'raw/inbox/recaptured.md', '--source-id', 'src-1', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(recheck.exitCode).toBe(0);
      expect(JSON.parse(recheck.stdout).data.verdict).toBe('drift');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a capture waiting in the inbox carries neither a source hash nor an ingested date', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'raw/inbox/a.md', '---\nsource_type: article\nsource_id: src-1\n---\n# Just captured\n');

      const content = await readFile(path.join(tmp.root, 'raw/inbox/a.md'), 'utf8');
      expect(content).not.toContain('source_hash:');
      expect(content).not.toContain('ingested:');

      // Lint reports it by location, whatever frontmatter it happens to carry.
      const lint = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(lint.exitCode).toBe(0);
      const codes = JSON.parse(lint.stdout).findings.map((f: { code: string }) => f.code);
      expect(codes).toContain('organize.uningested_inbox_material');
    } finally {
      await tmp.cleanup();
    }
  });

  it('successful ingest leaves catalog check green, and the retained capture takes no entry', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n');
      await writeNote(tmp.root, 'raw/inbox/a.md', '# New\n\nContent.\n');
      const ingested = await runCli(
        ['ingest', 'raw/inbox/a.md', '--into', 'projects/topic.md', '--source-type', 'web', '--source-id', 'src-1', '--json'],
        { cwd: tmp.root, env },
      );
      const retained = JSON.parse(ingested.stdout).data.capture as string;

      const check = await runCli(['catalog', 'check', '--json'], { cwd: tmp.root, env });
      expect(check.exitCode).toBe(0);
      expect(JSON.parse(check.stdout).data.missing).toEqual([]);

      const show = await runCli(['catalog', 'show', '--json'], { cwd: tmp.root, env });
      expect(show.stdout).not.toContain(retained);
    } finally {
      await tmp.cleanup();
    }
  });
});
