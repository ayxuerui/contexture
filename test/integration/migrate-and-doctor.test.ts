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

async function pinToSchemaV1(root: string): Promise<void> {
  const configPath = path.join(root, 'contexture.yaml');
  const text = await readFile(configPath, 'utf8');
  await writeFile(
    configPath,
    text
      // Version-agnostic on purpose: pinning against whatever `init` just
      // wrote, rather than a hardcoded current version, so a schema bump
      // can't silently turn this helper into a no-op and leave the test
      // asserting against an already-current store.
      .replace(/^schema_version: \d+$/m, 'schema_version: 1\nfields:\n  visibility: scope')
      // A genuine v1 store predates every rename this suite exercises: the
      // visibility-field key; (rename-procedures-to-skills) the
      // harness.skills_path key, which was harness.procedures_path through
      // schema_version 2; and (archive-destination-from-taxonomy) the
      // organize.archive_destination key, which was organize.archive_path
      // through schema_version 5.
      .replace('skills_path:', 'procedures_path:')
      .replace('archive_destination:', 'archive_path:'),
  );
}

/** Task 9.5's literal verification. */
describe('migrate and doctor aggregation (real CLI)', () => {
  it('migrate --dry-run against a store pinned one schema version behind prints the exact deltas, leaving files unchanged', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await pinToSchemaV1(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');

      const configBefore = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const noteBefore = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');

      const result = await runCli(['migrate', '--dry-run', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.applied).toBe(false);
      // Every pending migration is config-only now: the one that rewrote note
      // frontmatter was retired with the field it renamed (design.md D7).
      const paths = data.migrations.flatMap((m: { deltas: { path: string }[] }) => m.deltas.map((d) => d.path));
      expect([...new Set(paths)]).toEqual(['contexture.yaml']);

      const configAfter = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const noteAfter = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(configAfter).toBe(configBefore);
      expect(noteAfter).toBe(noteBefore);
    } finally {
      await tmp.cleanup();
    }
  });

  // retire-the-access-axes design.md D3: the migration removes the retired
  // config blocks and rewrites NO note, so a note still carrying a retired
  // visibility key survives byte-identically and stays fully retrievable.
  // That reversibility is what makes the removal a deferral rather than a
  // one-way door.
  it('migrating a store carrying the retired visibility key leaves every note byte-identical and still retrievable', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\ntitle: A\n---\nContent.\n');
      const before = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');

      // Pin one version behind so drop-access-axes is genuinely pending.
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const pinned = (await readFile(configPath, 'utf8'))
        .replace(/^schema_version: \d+$/m, 'schema_version: 6\nfields:\n  visibility: lens\nvisibility:\n  default_context: private\n  directory_defaults: {}\n  contexts: {}\ndisclosure:\n  internal_audiences: []\n  hard_walls: []\n  leak_markers: {}');
      await writeFile(configPath, pinned);

      const migrate = await runCli(['migrate', '--json'], { cwd: tmp.root, env });
      expect(migrate.exitCode).toBe(0);

      // The note is untouched, retired key and all.
      expect(await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8')).toBe(before);

      // The config lost exactly the three retired blocks.
      const after = await readFile(configPath, 'utf8');
      expect(after).toContain('schema_version: 7');
      expect(after).not.toMatch(/^fields:/m);
      expect(after).not.toMatch(/^visibility:/m);
      expect(after).not.toMatch(/^disclosure:/m);

      // Every retrieval leg still returns the note.
      const records = await runCli(['graph', 'build', '--emit-records', '--json'], { cwd: tmp.root, env });
      expect(records.exitCode).toBe(0);
      expect(JSON.parse(records.stdout).data.records.map((r: { path: string }) => r.path)).toEqual(['projects/a.md']);

      const gather = await runCli(['publish', 'gather', '--under', 'projects', '--json'], { cwd: tmp.root, env });
      expect(gather.exitCode).toBe(0);
      expect(JSON.parse(gather.stdout).data.notes.map((n: { path: string }) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('doctor --json on a deliberately broken store reports an ambiguous link, an oversized catalog section, and a missing hook as distinct failing checks', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      // Ambiguous link: two notes share the basename "dup", linked by that unqualified name.
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\n---\nLinks to [[dup]].\n');
      await writeNote(tmp.root, 'projects/dup.md', '---\nlens: shared\n---\nContent.\n');
      await writeNote(tmp.root, 'areas/dup.md', '---\nlens: shared\n---\nContent.\n');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      // Oversized catalog section: pad well past the default 32KiB budget.
      const catalogPath = path.join(tmp.root, '.contexture/catalog', 'projects.md');
      const catalogContent = await readFile(catalogPath, 'utf8');
      await writeFile(catalogPath, catalogContent + '\n' + 'x'.repeat(40_000));

      // Missing hook.
      const { rm } = await import('node:fs/promises');
      await rm(path.join(tmp.root, '.githooks', 'pre-commit'));

      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const checks: { id: string; result: string }[] = JSON.parse(result.stdout).data.checks;
      const byId = (id: string) => checks.find((c) => c.id === id);

      expect(byId('graph.ambiguous_links')?.result).toBe('fail');
      expect(byId('catalog.section_size')?.result).toBe('fail');
      expect(byId('git.hooks_health')?.result).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('doctor --json passes when the store\'s only defect is a not_found dangling link', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      await writeNote(tmp.root, 'projects/a.md', '---\nlens: shared\n---\nLinks to [[nowhere]].\n');
      await runCli(['catalog', 'build'], { cwd: tmp.root, env });
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const doctorResult = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctorResult.exitCode).toBe(0);
      const checks: { id: string; result: string }[] = JSON.parse(doctorResult.stdout).data.checks;
      expect(checks.some((c) => c.id === 'graph.ambiguous_links')).toBe(true);
      expect(checks.find((c) => c.id === 'graph.ambiguous_links')?.result).toBe('pass');

      const lintResult = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      const lintChecks: { id: string; findings: unknown[] }[] = JSON.parse(lintResult.stdout).data.checks;
      const brokenLinks = lintChecks.find((c) => c.id === 'organize.broken_links');
      expect(brokenLinks?.findings.length).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('no check id doctor treats as a failing invariant is also reported by lint (task 9.4)', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      // Trip every dual-tracked condition at once: fail-closed visibility, a
      // not_found link (lint's alone), and an ambiguous link (doctor's alone,
      // via two notes sharing a basename). Both link conditions are included
      // deliberately: an id-only overlap check previously passed throughout
      // the graph.dangling_links / organize.broken_links double-count (they
      // never shared an id), so id comparison alone is not proof the same
      // underlying condition isn't reported by both — the pair-level check
      // below is what actually proves it.
      await writeNote(tmp.root, 'projects/untagged.md', 'No frontmatter at all.\n');
      await writeNote(tmp.root, 'projects/broken.md', '---\nlens: shared\n---\nLinks to [[missing]].\n');
      await writeNote(tmp.root, 'projects/ambig-link.md', '---\nlens: shared\n---\nLinks to [[dup]].\n');
      await writeNote(tmp.root, 'projects/dup.md', '---\nlens: shared\n---\nContent.\n');
      await writeNote(tmp.root, 'areas/dup.md', '---\nlens: shared\n---\nContent.\n');
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const doctorResult = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      const lintResult = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(lintResult.exitCode).toBe(0); // lint always exits 0, regardless of doctor's outcome

      type CheckSummary = { id: string; result: string; findings?: { subject: string; details?: { target?: string } }[] };
      const doctorChecks: CheckSummary[] = JSON.parse(doctorResult.stdout).data.checks;
      const lintChecks: CheckSummary[] = JSON.parse(lintResult.stdout).data.checks;

      const doctorIds = new Set(doctorChecks.map((c) => c.id));
      const lintIds = new Set(lintChecks.map((c) => c.id));
      const idOverlap = [...doctorIds].filter((id) => lintIds.has(id));
      expect(idOverlap).toEqual([]);

      // Condition-level check: the same (subject, target) link pair must
      // never be reported as BOTH a doctor failure and a lint finding,
      // regardless of which check ids carry it.
      const linkPairKey = (f: { subject: string; details?: { target?: string } }) => `${f.subject} ${f.details?.target}`;
      const linkFindings = (checks: CheckSummary[], onlyFailing: boolean) =>
        checks
          .filter((c) => !onlyFailing || c.result === 'fail')
          .flatMap((c) => c.findings ?? [])
          .filter((f) => f.details?.target !== undefined);
      const doctorFailingPairs = new Set(linkFindings(doctorChecks, true).map(linkPairKey));
      const lintPairs = new Set(linkFindings(lintChecks, false).map(linkPairKey));
      const pairOverlap = [...doctorFailingPairs].filter((key) => lintPairs.has(key));
      expect(pairOverlap).toEqual([]);

      // Sanity: both link-shaped checks actually fired, so the assertions
      // above are not vacuously true.
      expect(doctorChecks.find((c) => c.id === 'graph.ambiguous_links')?.result).toBe('fail');
      expect(lintChecks.find((c) => c.id === 'organize.broken_links')?.findings?.length).toBeGreaterThan(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
