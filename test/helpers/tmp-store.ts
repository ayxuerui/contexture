import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TmpDir {
  root: string;
  cleanup(): Promise<void>;
}

export async function makeTmpDir(prefix = 'contexture-test-'): Promise<TmpDir> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
