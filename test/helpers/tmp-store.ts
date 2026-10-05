import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TmpDir {
  root: string;
  cleanup(): Promise<void>;
}

export async function makeTmpDir(prefix = 'contexture-test-'): Promise<TmpDir> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  // Retries on ENOTEMPTY and its kin: a store's .git has been seen gaining an entry while it is being removed
  // (`rmdir .git/objects: directory not empty`) when the machine is busy. Whatever writes there outlives the command
  // the test awaited, so wait it out rather than fail a test that already passed its assertions.
  return { root, cleanup: () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}
