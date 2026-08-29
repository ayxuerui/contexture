import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { queueAppend, reconcileQueue } from '../../src/core/queue.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('queueAppend / reconcileQueue', () => {
  it('applies a single queued append to a new target file', async () => {
    const tmp = await makeTmpDir();
    try {
      await queueAppend(tmp.root, 'log.md', '## Entry one\n');
      const { applied } = await reconcileQueue(tmp.root);
      expect(applied).toEqual([{ file: expect.any(String), target: 'log.md' }]);
      expect(await readFile(path.join(tmp.root, 'log.md'), 'utf8')).toBe('## Entry one\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('two queued appends to one fixture file both survive reconciliation, applied in order', async () => {
    const tmp = await makeTmpDir();
    try {
      await queueAppend(tmp.root, 'log.md', '## Entry one\n');
      // Ensure a distinct epoch-ms prefix so ordering is unambiguous even on a fast filesystem.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await queueAppend(tmp.root, 'log.md', '## Entry two\n');

      const { applied } = await reconcileQueue(tmp.root);
      expect(applied).toHaveLength(2);

      const content = await readFile(path.join(tmp.root, 'log.md'), 'utf8');
      expect(content).toBe('## Entry one\n## Entry two\n');

      // Both queue files were consumed.
      const remaining = await readdir(path.join(tmp.root, '.queue'));
      expect(remaining).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('appends to an existing file, inserting a separating newline if the file did not already end in one', async () => {
    const tmp = await makeTmpDir();
    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(tmp.root, 'log.md'), 'existing content, no trailing newline');
      await queueAppend(tmp.root, 'log.md', '## New entry\n');
      await reconcileQueue(tmp.root);
      const content = await readFile(path.join(tmp.root, 'log.md'), 'utf8');
      expect(content).toBe('existing content, no trailing newline\n## New entry\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('is a no-op when the queue directory does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const { applied } = await reconcileQueue(tmp.root);
      expect(applied).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('rejects a target path that escapes the store', async () => {
    const tmp = await makeTmpDir();
    try {
      await expect(queueAppend(tmp.root, '../outside.md', 'x')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('rejects a non-.md target path', async () => {
    const tmp = await makeTmpDir();
    try {
      await expect(queueAppend(tmp.root, 'config.yaml', 'x')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws on a malformed queue file missing the target header, without applying anything else', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, '.queue'), { recursive: true });
      await writeFile(path.join(tmp.root, '.queue', '1__bad.append'), 'not a valid header\nbody');
      await expect(reconcileQueue(tmp.root)).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });
});
