import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { profileById } from '../../src/taxonomy/profiles.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

describe('non-interactive init', () => {
  it('creates the capture tier: an inbox to capture into, excluded from retrieval and tracked in git', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const captureRoot = SHIPPED_DEFAULTS.ingest.capture_root;
      const inboxPath = SHIPPED_DEFAULTS.ingest.inbox_path;

      // There is somewhere to capture into, and it is inside the capture root.
      expect(existsSync(path.join(tmp.root, inboxPath))).toBe(true);
      expect(inboxPath.startsWith(captureRoot)).toBe(true);

      // Both are conventions the store accepted, so the file does not restate them.
      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configText).not.toContain('capture_root');
      expect(configText).not.toContain('inbox_path');
      expect(configText).not.toContain('exclude_paths');

      // Tracked, not derived and not ignored: provenance is committed.
      const config = parseYaml(configText);
      expect(config.derived?.paths ?? []).not.toContain(captureRoot);
      const gitignore = await readFile(path.join(tmp.root, '.gitignore'), 'utf8');
      expect(gitignore).not.toContain(captureRoot);

      const { stdout: tracked } = await execFileAsync('git', ['ls-files', captureRoot], { cwd: tmp.root, env });
      expect(tracked.trim()).toBe(`${inboxPath}.gitkeep`);

      // And the store is healthy with it there.
      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctor.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('creates PARA by default, commits once, prints no prompt, and doctor is clean', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();

      const initResult = await runCli(['init'], { cwd: tmp.root, env });
      expect(initResult.exitCode).toBe(0);
      expect(initResult.stderr).not.toContain('Choose a taxonomy profile');
      expect(initResult.stdout).not.toContain('Choose a taxonomy profile');

      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const config = parseYaml(configText) as { taxonomy: { layers: { name: string }[] } };
      expect(config.taxonomy.layers.map((l) => l.name)).toEqual(
        profileById('para')!.layers.map((l) => l.name),
      );

      const { stdout: log } = await execFileAsync('git', ['log', '--oneline'], { cwd: tmp.root, env });
      expect(log.trim().split('\n')).toHaveLength(1);
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: tmp.root, env });
      expect(status.trim()).toBe('');

      const doctorResult = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctorResult.exitCode).toBe(0);
      const doctorEnvelope = JSON.parse(doctorResult.stdout);
      expect(doctorEnvelope.status).toBe('ok');
      expect(doctorEnvelope.data.summary.fail).toBe(0);
      // A fresh, non-interactive init has no notes, so the only check that
      // can fire against an empty store is hook health — and init just
      // installed correct hooks, so it should pass.
      expect(doctorEnvelope.data.checks.every((c: { result: string }) => c.result !== 'fail')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  // init-generates-harness-adapter-output: the selected harnesses are wired in
  // the bootstrap commit, not left for a first `ctxr update`.
  it('--harness claude-code puts CLAUDE.md in the initial commit and creates no permission config', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--harness', 'claude-code', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const created: string[] = JSON.parse(result.stdout).data.created;

      expect(await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md');
      expect(created).toContain('CLAUDE.md');
      const { stdout: tracked } = await execFileAsync('git', ['ls-files'], { cwd: tmp.root, env });
      expect(tracked.split('\n')).toContain('CLAUDE.md');

      // The claude-code permission config is cleanup-only: nothing to create.
      expect(existsSync(path.join(tmp.root, '.claude/settings.json'))).toBe(false);
      expect(created).not.toContain('.claude/settings.json');
      expect(tracked).not.toContain('.claude/settings.json');

      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: tmp.root, env });
      expect(status).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('--harness hermes-agent bridges its skills and writes no entry file', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--harness', 'hermes-agent'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(path.join(tmp.root, '.hermes/skills'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('--harness codex,antigravity records both, writes no entry file, bridges nothing, and doctor is clean', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--harness', 'codex,antigravity'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const config = parseYaml(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')) as { adapters: { id: string }[] };
      expect(config.adapters.map((a) => a.id)).toEqual(['codex', 'antigravity']);
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(path.join(tmp.root, '.claude'))).toBe(false);
      expect(existsSync(path.join(tmp.root, '.agents/skills/ctxr-capture/SKILL.md'))).toBe(true);
      const doctor = await runCli(['doctor'], { cwd: tmp.root, env });
      expect(doctor.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('init --help names every selectable harness', async () => {
    const result = await runCli(['init', '--help'], { cwd: process.cwd() });
    for (const id of ['claude-code', 'hermes-agent', 'codex', 'antigravity']) expect(result.stdout + result.stderr).toContain(id);
  });

  it('--harness none writes no entry file and no harness directory', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli(['init', '--harness', 'none'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(path.join(tmp.root, '.claude'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
