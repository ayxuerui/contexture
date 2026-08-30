import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/run.js';
import { makeFakeEnv, readAll } from '../helpers/fake-env.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** cli-contract (cli-distribution-identity): the CLI is distributed and invoked as `ctxr`. */
describe('cli-contract: the CLI is distributed and invoked as ctxr', () => {
  it('the package installs the executable under both names', async () => {
    const pkg = JSON.parse(await readFile(path.resolve(HERE, '../../package.json'), 'utf8')) as {
      name: string;
      bin: Record<string, string>;
    };
    expect(pkg.name).toBe('ctxr');
    expect(pkg.bin.ctxr).toBe('./dist/bin.js');
    expect(pkg.bin.contexture).toBe(pkg.bin.ctxr);
  });

  it('usage output names the executable ctxr, never contexture', async () => {
    const env = makeFakeEnv();
    const exitCode = await run(['--help'], env);
    expect(exitCode).toBe(0);
    const usage = readAll(env.io.stderr as unknown as PassThrough);
    expect(usage).toMatch(/^Usage: ctxr /m);
    expect(usage).not.toMatch(/^Usage: contexture/m);
  });
});
