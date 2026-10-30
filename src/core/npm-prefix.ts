import { execFile } from 'node:child_process';
import path from 'node:path';

/**
 * The one place ctxr spawns npm: `npm prefix -g`, to learn where `npm install -g` writes, so the
 * version report can tell whether that install would replace the running executable
 * (install-tools-in-the-home D4). Only asked when NPM_CONFIG_PREFIX / npm_config_prefix do not
 * already answer.
 */
export type NpmPrefixRunner = () => Promise<string | null>;

const NPM_PREFIX_TIMEOUT_MS = 5_000;

/** `npm prefix -g`, or null when npm is not on PATH, fails, or does not answer in time. */
export const askNpmForPrefix: NpmPrefixRunner = () =>
  new Promise((resolve) => {
    execFile('npm', ['prefix', '-g'], { timeout: NPM_PREFIX_TIMEOUT_MS, killSignal: 'SIGKILL', shell: process.platform === 'win32' },
      (err, stdout) => {
        const answer = String(stdout ?? '').trim();
        resolve(err || answer === '' || !path.isAbsolute(answer) ? null : answer);
      });
  });
