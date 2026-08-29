import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/** Task 1.7's literal verification. */
describe('contexture note resolve', () => {
  it('reports the fail-closed default with reason "fail-closed default"', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'no-frontmatter.md'), '# No frontmatter\n');

      const result = await runCli(['note', 'resolve', 'projects/no-frontmatter.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.reason).toBe('fail-closed default');
      expect(data.visibility).toBe('private');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a fixture with an explicit field reports reason "explicit"', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(
        path.join(tmp.root, 'projects', 'explicit.md'),
        '---\nlens: shared\n---\n# Explicit\n',
      );

      const result = await runCli(['note', 'resolve', 'projects/explicit.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.reason).toBe('explicit');
      expect(data.visibility).toBe('shared');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a directory default when configured and no explicit field is set', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      // Add a directory default to the freshly-written config.
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const { readFile } = await import('node:fs/promises');
      const { parse: parseYaml, stringify: stringifyYaml } = await import('yaml');
      const config = parseYaml(await readFile(configPath, 'utf8'));
      config.visibility.directory_defaults = { 'areas/Life': 'personal' };
      await writeFile(configPath, stringifyYaml(config));

      await mkdir(path.join(tmp.root, 'areas', 'Life'), { recursive: true });
      await writeFile(path.join(tmp.root, 'areas', 'Life', 'journal.md'), '# Journal\n');

      const result = await runCli(['note', 'resolve', 'areas/Life/journal.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.reason).toBe('directory default');
      expect(data.visibility).toBe('personal');
    } finally {
      await tmp.cleanup();
    }
  });

  it('exits non-zero naming the file on malformed frontmatter', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeFile(path.join(tmp.root, 'broken.md'), '---\ntitle: "unterminated\n---\n# Hi\n');

      const result = await runCli(['note', 'resolve', 'broken.md', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('note.invalid_frontmatter');
      expect(parsed.findings[0].subject).toBe('broken.md');
    } finally {
      await tmp.cleanup();
    }
  });
});
