import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/init.js';
import type { Prompter } from '../../src/prompt/prompter.js';
import { collectingStream, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function interactiveIo() {
  return { stdin: collectingStream(true), stdout: collectingStream(true), stderr: collectingStream(false) };
}

/**
 * Proves the deterministic facts about the taxonomy prompt without a real
 * terminal: the fake Prompter is injected via RunEnv, so `isInteractive()`
 * only needs io.stdin/stdout.isTTY set — nothing here needs a real pty. The
 * genuinely TTY-dependent facts (does a real terminal actually render this)
 * are proven separately in init-interactive.pty.test.ts.
 */
describe('init taxonomy prompt (interactive path)', () => {
  it('offers all three shipped profiles with their names and descriptions', async () => {
    const tmp = await makeTmpDir();
    try {
      const calls: Parameters<Prompter['selectProfile']>[0][] = [];
      const prompter: Prompter = {
        async selectProfile(input) {
          calls.push(input);
          return 'para';
        },
        async confirm() {
          return true;
        },
        async selectHarnesses() {
          return ['claude-code'];
        },
      };
      const env = makeFakeEnv({ prompter, io: interactiveIo(), env: GIT_IDENTITY_ENV });

      await execute(env, { root: tmp.root });

      expect(calls).toHaveLength(1);
      const ids = calls[0]!.choices.map((c) => c.id).sort();
      expect(ids).toEqual(['diataxis', 'para', 'zettelkasten']);
      for (const choice of calls[0]!.choices) {
        expect(choice.name.length).toBeGreaterThan(0);
        expect(choice.description.length).toBeGreaterThan(0);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not write contexture.yaml until after a selection is made', async () => {
    const tmp = await makeTmpDir();
    try {
      const configPath = path.join(tmp.root, 'contexture.yaml');
      let existedAtPromptTime: boolean | undefined;
      const prompter: Prompter = {
        async selectProfile() {
          existedAtPromptTime = existsSync(configPath);
          return 'para';
        },
        async confirm() {
          return true;
        },
        async selectHarnesses() {
          return ['claude-code'];
        },
      };
      const env = makeFakeEnv({ prompter, io: interactiveIo(), env: GIT_IDENTITY_ENV });

      await execute(env, { root: tmp.root });

      expect(existedAtPromptTime).toBe(false);
      expect(existsSync(configPath)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('selecting zettelkasten yields a taxonomy with no layers', async () => {
    const tmp = await makeTmpDir();
    try {
      const prompter: Prompter = {
        async selectProfile() {
          return 'zettelkasten';
        },
        async confirm() {
          return true;
        },
        async selectHarnesses() {
          return ['claude-code'];
        },
      };
      const env = makeFakeEnv({ prompter, io: interactiveIo(), env: GIT_IDENTITY_ENV });

      const outcome = await execute(env, { root: tmp.root });

      expect(outcome.data?.taxonomy.layers).toEqual([]);
      expect(outcome.data?.taxonomy.profile).toBe('zettelkasten');
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not prompt when a profile is given explicitly, even interactively', async () => {
    const tmp = await makeTmpDir();
    try {
      let called = false;
      const prompter: Prompter = {
        async selectProfile() {
          called = true;
          return 'para';
        },
        async confirm() {
          return true;
        },
        async selectHarnesses() {
          return ['claude-code'];
        },
      };
      const env = makeFakeEnv({ prompter, io: interactiveIo(), env: GIT_IDENTITY_ENV });

      await execute(env, { root: tmp.root, profile: 'diataxis' });

      expect(called).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
