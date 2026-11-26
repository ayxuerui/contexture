import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { makeApprovalStore } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';
import { makeSessionPair } from '../helpers/session-stores.js';

const execFileAsync = promisify(execFile);

/**
 * support-gitlab-as-a-forge: what a store whose `origin` is on GitLab does
 * before any GitLab call — the refusals. The origin is named as a gitlab.com
 * URL that git rewrites back to the local bare repository it really is, so
 * nothing here reaches the network.
 */
async function nameOriginOnGitLab(cwd: string, env: Record<string, string | undefined>, project: string): Promise<void> {
  const git = async (args: string[]) => (await execFileAsync('git', args, { cwd, env: env as NodeJS.ProcessEnv })).stdout.trim();
  const real = await git(['config', '--get', 'remote.origin.url']);
  const url = `https://gitlab.com/${project}.git`;
  await git(['config', `url.${real}.insteadOf`, url]);
  await git(['config', 'remote.origin.url', url]);
}

const findings = (r: { stdout: string }): { code: string; message: string }[] => (JSON.parse(r.stdout) as { findings: { code: string; message: string }[] }).findings;

describe('a store on GitLab (real CLI, no network)', { timeout: 90_000 }, () => {
  it('names both token variables, and calls nothing, when a command needs the API and no token is set', async () => {
    const store = await makeApprovalStore();
    try {
      await nameOriginOnGitLab(store.root, store.env, 'ctx-a/team/work');
      const listed = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
      expect(listed.exitCode).not.toBe(0);
      const [finding] = findings(listed);
      expect(finding!.code).toBe('forge.credentials');
      expect(finding!.message).toContain('CONTEXTURE_GITLAB_TOKEN');
      expect(finding!.message).toContain('CONTEXTURE_GITLAB_TOKEN_FILE');
      // The fake `gh` was never asked: a GitLab store does not fall back to it.
      expect(await store.forge.log()).toBe('');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses two token sources, naming both and neither value', async () => {
    const store = await makeApprovalStore();
    try {
      await nameOriginOnGitLab(store.root, store.env, 'ctx-a/work');
      const env = { ...store.env, CONTEXTURE_GITLAB_TOKEN: 'glpat-ctxaSECRET', CONTEXTURE_GITLAB_TOKEN_FILE: '/nonexistent' };
      const listed = await runCli(['review', 'list', '--json'], { cwd: store.root, env });
      expect(listed.exitCode).not.toBe(0);
      expect(findings(listed)[0]!.code).toBe('forge.credentials');
      expect(listed.stdout + listed.stderr).not.toContain('glpat-ctxaSECRET');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses merge_method rebase before any forge write', async () => {
    const store = await makeApprovalStore({ approvalExtra: '  merge_method: rebase\n' });
    try {
      await nameOriginOnGitLab(store.root, store.env, 'ctx-a/work');
      const landed = await runCli(['land', '--pending', '--json'], { cwd: store.root, env: { ...store.env, CONTEXTURE_GITLAB_TOKEN: 'glpat-ctxaSECRET' } });
      expect(landed.exitCode).not.toBe(0);
      expect(findings(landed)[0]!.code).toBe('change_approval.merge_method');
      expect(findings(landed)[0]!.message).toMatch(/squash.*merge/);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses to join a session across forges, creating nothing', async () => {
    const pair = await makeSessionPair();
    try {
      const home = await pair.cli(['session', 'start', 'ctx-move'], pair.a.root);
      expect(home.exitCode, home.stdout + home.stderr).toBe(0);
      await nameOriginOnGitLab(pair.mount, pair.env, 'ctx-b/work');
      const joined = await pair.cli(['session', 'start', '--joins', home.json.data.branch], pair.mount);
      expect(joined.exitCode).not.toBe(0);
      const text = JSON.stringify(joined.json);
      expect(text).toContain('join_across_forges');
      expect(text).toContain('GitLab (gitlab.com)');
      const branches = (await execFileAsync('git', ['branch', '--list', 'session/*'], { cwd: pair.mount, env: pair.env as NodeJS.ProcessEnv })).stdout.trim();
      expect(branches).toBe('');
    } finally {
      await pair.tmp.cleanup();
    }
  });
});
