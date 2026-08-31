import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLI_VERSION } from '../../src/version.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, relative), 'utf8')) as T;
}

/** cli-contract: every --json envelope reports cli_version, so a drifted CLI_VERSION ships a lie. */
describe('cli-contract: the reported CLI version is the published version', () => {
  it('CLI_VERSION matches package.json "version"', async () => {
    const pkg = await readJson<{ version: string }>('package.json');
    expect(CLI_VERSION).toBe(pkg.version);
  });

  it('the lockfile records the same root version', async () => {
    const pkg = await readJson<{ version: string }>('package.json');
    const lock = await readJson<{ version: string; packages: Record<string, { version?: string }> }>(
      'package-lock.json',
    );
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
  });
});
