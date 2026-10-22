import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FAKE_GH_SCRIPT = fileURLToPath(new URL('./fake-gh.mjs', import.meta.url));

export interface FakePull {
  number: number;
  head: string;
  base?: string;
  title?: string;
  body?: string;
  user?: string;
  state?: 'open' | 'closed';
  merged?: boolean;
  mergeable?: boolean | null;
  /** Reported as the head instead of the branch's real tip, as a forge that has not seen a push yet would. */
  stale_head?: string;
}

export interface FakeForgeState {
  login: string;
  pulls: FakePull[];
  reviews?: Record<string, { user: { login: string }; state: string; body: string; commit_id: string; submitted_at: string }[]>;
  comments?: Record<string, { user: { login: string }; body: string; created_at: string }[]>;
  fail?: Record<string, number>;
  failAfterMerge?: boolean;
  /** How many pull-request creations to refuse before one succeeds. */
  failCreatePull?: number;
  /** App mode: refuse any call whose GH_TOKEN does not start with this, and record the tokens seen. */
  expectTokenPrefix?: string;
}

export interface FakeForge {
  /** Prepend to PATH. */
  binDir: string;
  /** Environment to pass to the process that runs `gh`. */
  env: Record<string, string>;
  read(): Promise<FakeForgeState>;
  write(state: FakeForgeState): Promise<void>;
  update(mutate: (state: FakeForgeState) => void): Promise<void>;
  /** The distinct GH_TOKEN values `gh` was called with, when `expectTokenPrefix` is set. */
  tokensSeen(): Promise<string[]>;
}

/** A `gh` on PATH backed by a JSON state file and, when given, a bare origin repository. */
export async function makeFakeForge(dir: string, state: FakeForgeState, originGitDir?: string): Promise<FakeForge> {
  const binDir = path.join(dir, 'fake-gh-bin');
  await mkdir(binDir, { recursive: true });
  const ghPath = path.join(binDir, 'gh');
  await writeFile(ghPath, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_GH_SCRIPT}" "$@"\n`);
  await chmod(ghPath, 0o755);
  const statePath = path.join(dir, 'fake-gh-state.json');
  const forge: FakeForge = {
    binDir,
    env: {
      FAKE_GH_STATE: statePath,
      ...(originGitDir === undefined ? {} : { FAKE_GH_ORIGIN: originGitDir }),
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    async read() {
      return JSON.parse(await readFile(statePath, 'utf8')) as FakeForgeState;
    },
    async write(next) {
      await writeFile(statePath, JSON.stringify(next, null, 2));
    },
    async tokensSeen() {
      const text = await readFile(`${statePath}.tokens`, 'utf8').catch(() => '');
      return [...new Set(text.split('\n').filter(Boolean))];
    },
    async update(mutate) {
      const current = await forge.read();
      mutate(current);
      await forge.write(current);
    },
  };
  await forge.write(state);
  return forge;
}
