import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { confinedEnv, landlockArgs, onPath, returnLogins, seedLogins, type ConfinedRun, type SeededLogin } from './confine.js';

/**
 * run-the-second-opinion-from-the-cli: the one place a model CLI is
 * launched. No shell anywhere: an argument vector plus standard input, in a
 * fresh empty scratch directory, with the allowlisted environment the caller
 * built (D3). Ported from the skill's `run.mjs` unchanged in behaviour.
 *
 * serve-the-second-opinion-to-chat-apps D1: given a confined run, the scratch
 * directory is also the CLI's home, seeded with its login, and the CLI starts
 * under `setpriv`'s Landlock rules.
 */
export interface CliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  cause?: string;
}

export const firstLines = (text: string, n: number): string => text.trim().split('\n').slice(0, n).join(' | ').slice(0, 400);

/** Runs one CLI. Resolves with what it printed and, on failure, why; never rejects. */
export function runCli(cmd: string, args: readonly string[], stdin: string, timeoutSec: number, env: Record<string, string>, confine?: ConfinedRun): Promise<CliResult> {
  return new Promise((resolve) => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'ctxr-second-opinion-'));
    let seeded: SeededLogin[] = [];
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (result: { ok: boolean; cause?: string }): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        returnLogins(seeded);
      } catch {
        // the original stays as it was; the next run seeds from it
      }
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        // best effort
      }
      resolve({ stdout, stderr, ...result });
    };
    let program = cmd;
    let argv = [...args];
    let childEnv = env;
    if (confine) {
      const binary = onPath(cmd, env.PATH);
      if (binary === null) {
        done({ ok: false, cause: `'${cmd}' not found on PATH` });
        return;
      }
      try {
        seeded = seedLogins(confine, scratch);
        program = confine.setpriv;
        argv = landlockArgs(binary, args, scratch, confine, env);
        childEnv = confinedEnv(env, scratch);
      } catch (err) {
        done({ ok: false, cause: `could not prepare ${cmd}'s folder: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
    }
    let child: ReturnType<typeof spawn>;
    try {
      // detached: the CLI leads its own process group, so a timeout can stop everything it started.
      child = spawn(program, argv, { cwd: scratch, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    } catch (err) {
      done({ ok: false, cause: `could not start ${cmd}: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    const killGroup = (signal: NodeJS.Signals): void => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal);
      } catch {
        // already gone
      }
    };
    timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 2000).unref();
    }, timeoutSec * 1000);
    // Decoded as a stream, so a multibyte character split across chunks survives.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr?.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', (err: NodeJS.ErrnoException) =>
      done({ ok: false, cause: err.code === 'ENOENT' ? `'${program === cmd ? cmd : program}' not found on PATH` : `could not start ${cmd}: ${err.message}` }),
    );
    child.on('close', (code) => {
      if (timedOut) return done({ ok: false, cause: `timed out after ${timeoutSec}s` });
      if (code !== 0) return done({ ok: false, cause: `exit ${code}: ${firstLines(stderr || stdout, 3)}` });
      return done({ ok: true });
    });
    child.stdin?.on('error', () => {
      // the CLI closed stdin early; its exit code says why
    });
    child.stdin?.end(stdin);
  });
}
