import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeJsonArrayLists } from '../../src/core/json-config-merge.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('mergeJsonArrayLists', () => {
  it('creates the file (with parent directories) when none exists', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, '.claude', 'settings.json');
      const { changed } = await mergeJsonArrayLists(filePath, { permissions: { deny: ['a'], allow: ['b'] } });
      expect(changed).toBe(true);
      const written = JSON.parse(await readFile(filePath, 'utf8'));
      expect(written).toEqual({ permissions: { deny: ['a'], allow: ['b'] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('is idempotent: a second call with the same rules changes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'settings.json');
      await mergeJsonArrayLists(filePath, { permissions: { deny: ['a', 'b'] } });
      const before = await readFile(filePath, 'utf8');

      const { changed } = await mergeJsonArrayLists(filePath, { permissions: { deny: ['a', 'b'] } });
      const after = await readFile(filePath, 'utf8');

      expect(changed).toBe(false);
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves a hand-added rule not in the generated set', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'settings.json');
      await mkdir(tmp.root, { recursive: true });
      await writeFile(filePath, JSON.stringify({ permissions: { deny: ['hand-added-rule'] } }));

      await mergeJsonArrayLists(filePath, { permissions: { deny: ['generated-rule'] } });
      const written = JSON.parse(await readFile(filePath, 'utf8'));
      expect(written.permissions.deny).toEqual(['hand-added-rule', 'generated-rule']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves unrelated top-level keys already in the file', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'settings.json');
      await mkdir(tmp.root, { recursive: true });
      await writeFile(filePath, JSON.stringify({ someOtherSetting: true }));

      await mergeJsonArrayLists(filePath, { permissions: { deny: ['a'] } });
      const written = JSON.parse(await readFile(filePath, 'utf8'));
      expect(written.someOtherSetting).toBe(true);
      expect(written.permissions.deny).toEqual(['a']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not add a rule already present, avoiding duplicates', async () => {
    const tmp = await makeTmpDir();
    try {
      const filePath = path.join(tmp.root, 'settings.json');
      await mkdir(tmp.root, { recursive: true });
      await writeFile(filePath, JSON.stringify({ permissions: { deny: ['a'] } }));

      await mergeJsonArrayLists(filePath, { permissions: { deny: ['a', 'b'] } });
      const written = JSON.parse(await readFile(filePath, 'utf8'));
      expect(written.permissions.deny).toEqual(['a', 'b']);
    } finally {
      await tmp.cleanup();
    }
  });
});
