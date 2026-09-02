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

  describe('remove option', () => {
    it('removes exact matches only, leaving a near-miss string untouched', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        await writeFile(filePath, JSON.stringify({ permissions: { deny: ['a', 'ab', 'a-extra'] } }));

        await mergeJsonArrayLists(filePath, { permissions: { deny: [] } }, { remove: { permissions: { deny: ['a'] } } });
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.permissions.deny).toEqual(['ab', 'a-extra']);
      } finally {
        await tmp.cleanup();
      }
    });

    it('leaves a hand-added rule untouched even when the current patch would otherwise emit it', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        await writeFile(filePath, JSON.stringify({ permissions: { deny: ['hand-added'] } }));

        await mergeJsonArrayLists(
          filePath,
          { permissions: { deny: ['generated'] } },
          { remove: { permissions: { deny: ['some-other-retired-rule'] } } },
        );
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.permissions.deny).toEqual(['hand-added', 'generated']);
      } finally {
        await tmp.cleanup();
      }
    });

    it('drops a list key emptied by removal, but keeps a pre-existing intentional empty array', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        await writeFile(filePath, JSON.stringify({ permissions: { deny: ['stale-a', 'stale-b'], allow: [] } }));

        await mergeJsonArrayLists(
          filePath,
          {},
          { remove: { permissions: { deny: ['stale-a', 'stale-b'] } } },
        );
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.permissions.deny).toBeUndefined();
        expect(written.permissions.allow).toEqual([]);
      } finally {
        await tmp.cleanup();
      }
    });

    it('is idempotent: a second call with the same patch and remove changes nothing', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        await writeFile(filePath, JSON.stringify({ permissions: { deny: ['stale', 'kept'] } }));

        const patch = { permissions: { deny: ['kept', 'fresh'] } };
        const remove = { permissions: { deny: ['stale'] } };
        await mergeJsonArrayLists(filePath, patch, { remove });
        const before = await readFile(filePath, 'utf8');

        const { changed } = await mergeJsonArrayLists(filePath, patch, { remove });
        const after = await readFile(filePath, 'utf8');
        expect(changed).toBe(false);
        expect(after).toBe(before);
      } finally {
        await tmp.cleanup();
      }
    });
  });

  describe('hook-matcher-entry lists', () => {
    function hookEntry(command: string): { matcher: string; hooks: { type: string; command: string }[] } {
      return { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command }] };
    }

    it('appends a new hook entry when none with the same command exists', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        const { changed } = await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/bin/gate.sh')] } });
        expect(changed).toBe(true);
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.hooks.PreToolUse).toEqual([hookEntry('/bin/gate.sh')]);
      } finally {
        await tmp.cleanup();
      }
    });

    it('replaces contexture\'s own entry in place on a second run, producing no duplicate', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/bin/gate.sh')] } });
        const before = await readFile(filePath, 'utf8');

        const { changed } = await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/bin/gate.sh')] } });
        const after = await readFile(filePath, 'utf8');
        expect(changed).toBe(false);
        expect(after).toBe(before);
        const written = JSON.parse(after);
        expect(written.hooks.PreToolUse).toHaveLength(1);
      } finally {
        await tmp.cleanup();
      }
    });

    it('leaves an operator-added hook entry with a different command untouched', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        const operatorEntry = hookEntry('/home/me/my-hook.sh');
        await writeFile(filePath, JSON.stringify({ hooks: { PreToolUse: [operatorEntry] } }));

        await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/bin/gate.sh')] } });
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.hooks.PreToolUse).toEqual([operatorEntry, hookEntry('/bin/gate.sh')]);
      } finally {
        await tmp.cleanup();
      }
    });

    it('replaces a same-script entry whose absolute path differs, in place, producing no duplicate (stabilize-write-gate-hook-path)', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        // Same matcher, same script basename, different absolute path prefix —
        // e.g. two different session worktrees that each once ran the generator.
        await writeFile(
          filePath,
          JSON.stringify({ hooks: { PreToolUse: [hookEntry('/home/me/.worktrees/session-a/.claude/hooks/gate.sh')] } }),
        );

        const { changed } = await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/home/me/.claude/hooks/gate.sh')] } });
        expect(changed).toBe(true);
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.hooks.PreToolUse).toEqual([hookEntry('/home/me/.claude/hooks/gate.sh')]);
      } finally {
        await tmp.cleanup();
      }
    });

    it('collapses more than one accumulated stale copy of the same script down to one, in the first one\'s position', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        const operatorEntry = hookEntry('/home/me/my-hook.sh');
        await writeFile(
          filePath,
          JSON.stringify({
            hooks: {
              PreToolUse: [
                hookEntry('/home/me/.worktrees/session-a/.claude/hooks/gate.sh'),
                operatorEntry,
                hookEntry('/home/me/.worktrees/session-b/.claude/hooks/gate.sh'),
              ],
            },
          }),
        );

        await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/home/me/.claude/hooks/gate.sh')] } });
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        // Exactly one gate.sh entry survives, at the first stale entry's
        // original position — the operator's unrelated entry is untouched.
        expect(written.hooks.PreToolUse).toEqual([hookEntry('/home/me/.claude/hooks/gate.sh'), operatorEntry]);
      } finally {
        await tmp.cleanup();
      }
    });

    it('leaves an operator hook with the same matcher but a different script basename untouched', async () => {
      const tmp = await makeTmpDir();
      try {
        const filePath = path.join(tmp.root, 'settings.json');
        await mkdir(tmp.root, { recursive: true });
        const operatorEntry = hookEntry('/home/me/.claude/hooks/my-other-hook.sh');
        await writeFile(filePath, JSON.stringify({ hooks: { PreToolUse: [operatorEntry] } }));

        await mergeJsonArrayLists(filePath, { hooks: { PreToolUse: [hookEntry('/home/me/.claude/hooks/gate.sh')] } });
        const written = JSON.parse(await readFile(filePath, 'utf8'));
        expect(written.hooks.PreToolUse).toEqual([operatorEntry, hookEntry('/home/me/.claude/hooks/gate.sh')]);
      } finally {
        await tmp.cleanup();
      }
    });
  });
});
