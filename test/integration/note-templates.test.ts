import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTALLED_TEMPLATES } from '../../src/config/defaults.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const TEMPLATES_DIR = '.contexture/templates';

/**
 * Edits the store's config through the YAML parser, never by appending text: a
 * PARA store's written config already carries a `retrieval:` block (its
 * demote_paths are seeded from the taxonomy), so appending a second one is a
 * duplicate key, not an override.
 */
async function editConfig(root: string, mutate: (config: Record<string, any>) => void): Promise<void> {
  const configPath = path.join(root, 'contexture.yaml');
  const config = parseYaml(await readFile(configPath, 'utf8')) as Record<string, any>;
  mutate(config);
  await writeFile(configPath, stringifyYaml(config));
}

/**
 * standardize-note-templates, end to end through the real CLI: init installs
 * the declared library, update refreshes it, an operator's edit survives, and a
 * store that removes every template keeps working.
 */
describe('note templates (real CLI)', () => {
  it('init installs the declared library and adds no new root-level entry', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const init = await runCli(['init', '--profile', 'para', '--harness', 'claude-code'], { cwd: tmp.root, env });
      expect(init.exitCode).toBe(0);

      for (const name of DEFAULT_INSTALLED_TEMPLATES) {
        const text = await readFile(path.join(tmp.root, TEMPLATES_DIR, `${name}.md`), 'utf8');
        expect(text, name).toContain('# {{title}}');
      }
      const record = JSON.parse(await readFile(path.join(tmp.root, TEMPLATES_DIR, '.ctxr-templates.json'), 'utf8'));
      expect([...record.templates].sort()).toEqual([...DEFAULT_INSTALLED_TEMPLATES].sort());

      // The templates live in the tool home directory, not at the store root.
      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctor.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a template is never enumerated as a note, so lint and the catalog ignore it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const catalog = await runCli(['catalog', 'build', '--json'], { cwd: tmp.root, env });
      expect(catalog.exitCode).toBe(0);
      expect(catalog.stdout).not.toContain('templates/Note.md');

      const lint = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      expect(lint.stdout).not.toContain(`${TEMPLATES_DIR}/`);
    } finally {
      await tmp.cleanup();
    }
  });

  it('installs the compass as fixed content, unaffected by the store\'s relation vocabulary', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const conceptPath = path.join(tmp.root, TEMPLATES_DIR, 'Concept.md');
      const before = await readFile(conceptPath, 'utf8');
      for (const relation of ['Upstream', 'Downstream', 'Similar', 'Opposing']) {
        expect(before, relation).toContain(`## ${relation}`);
      }

      const first = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);
      expect(JSON.parse(first.stdout).data.changed).toEqual([]);

      // A store declaring its own vocabulary changes what the graph types, not
      // what a template says — the template is not a rendered artifact.
      await editConfig(tmp.root, (c) => {
        c.retrieval = { ...(c.retrieval ?? {}), relations: ['Supports'] };
      });

      const second = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(0);
      expect(JSON.parse(second.stdout).data.changed).not.toContain(`${TEMPLATES_DIR}/Concept.md`);
      expect(await readFile(conceptPath, 'utf8')).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it("an operator's edit does not survive update, and nothing reports it", async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const target = path.join(tmp.root, TEMPLATES_DIR, 'People.md');
      const packagedBytes = await readFile(target, 'utf8');
      await writeFile(target, '# mine now\n');

      const update = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(update.exitCode).toBe(0);
      expect(await readFile(target, 'utf8')).toBe(packagedBytes);
      const findings = JSON.parse(update.stdout).findings as { code: string }[];
      expect(findings.map((f) => f.code)).not.toContain('templates.locally_modified');

      // And a house variant, under its own name, is left alone.
      const own = path.join(tmp.root, TEMPLATES_DIR, 'Meeting.md');
      await writeFile(own, '# our own shape\n');
      const second = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(JSON.parse(second.stdout).data.changed).toEqual([]);
      expect(await readFile(own, 'utf8')).toBe('# our own shape\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports an unsubstituted placeholder through lint, and never fails doctor for it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);

      // A note that landed straight from the template, never filled in.
      await writeFile(path.join(tmp.root, 'projects/unfinished.md'), '---\ntitle: "{{title}}"\n---\n# {{title}}\n');
      // And one carrying another tool's double-brace syntax, which must not be reported.
      await writeFile(path.join(tmp.root, 'projects/quoting.md'), '# Quoting\n\n- {{embed ((680491b3-2324))}}\n');

      const lint = await runCli(['lint', '--json'], { cwd: tmp.root, env });
      const findings = JSON.parse(lint.stdout).findings as { code: string; subject?: string }[];
      const reported = findings.filter((f) => f.code === 'store.unsubstituted_placeholder').map((f) => f.subject);
      expect(reported).toEqual(['projects/unfinished.md']);

      // The note is valid, just unfinished — doctor has no business failing.
      // The catalog is built first so coverage (a real invariant, and unrelated
      // to this one) is not what decides the exit code.
      expect((await runCli(['catalog', 'build', '--json'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      const doctorFindings = JSON.parse(doctor.stdout).findings as { code: string }[];
      expect(doctorFindings.map((f) => f.code)).not.toContain('store.unsubstituted_placeholder');
      expect(doctor.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a store that installs none keeps every command working', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);

      await editConfig(tmp.root, (c) => {
        c.templates = { installed: [] };
      });

      const update = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(update.exitCode).toBe(0);
      await expect(readFile(path.join(tmp.root, TEMPLATES_DIR, 'Note.md'), 'utf8')).rejects.toThrow();

      expect((await runCli(['doctor', '--json'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await runCli(['lint', '--json'], { cwd: tmp.root, env })).exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a newly declared template arrives on the next update', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--profile', 'para', '--harness', 'none'], { cwd: tmp.root, env })).exitCode).toBe(0);
      await rm(path.join(tmp.root, TEMPLATES_DIR), { recursive: true, force: true });

      await editConfig(tmp.root, (c) => {
        c.templates = { installed: ['Note'] };
      });
      expect((await runCli(['update', '--json'], { cwd: tmp.root, env })).exitCode).toBe(0);

      await editConfig(tmp.root, (c) => {
        c.templates = { installed: ['Note', 'Project'] };
      });
      const update = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(JSON.parse(update.stdout).data.changed).toContain(`${TEMPLATES_DIR}/Project.md`);
    } finally {
      await tmp.cleanup();
    }
  });
});
