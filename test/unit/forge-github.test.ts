import { describe, expect, it } from 'vitest';
import { createGhForgeClient, ForgeRequestError } from '../../src/core/forge/github.js';
import { makeFakeForge } from '../helpers/fake-forge.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('the gh forge client', () => {
  it('reads pulls, reviews and comments, and writes reviews and comments, through gh api', async () => {
    const tmp = await makeTmpDir();
    try {
      const forge = await makeFakeForge(tmp.root, {
        login: 'ctx-approvals',
        pulls: [{ number: 7, head: 'session/ctx-a', title: 'Add ctx-a', body: 'Why: ctx-a.' }],
      });
      const client = createGhForgeClient(tmp.root, { ...process.env, ...forge.env });

      expect(await client.login()).toBe('ctx-approvals');
      const pull = await client.pull(7);
      expect(pull).toMatchObject({ number: 7, state: 'open', merged: false, title: 'Add ctx-a', body: 'Why: ctx-a.', headRef: 'session/ctx-a', baseRef: 'main', author: 'ctx-agent' });
      expect((await client.openPulls()).map((p) => p.number)).toEqual([7]);

      await client.createReview(7, { event: 'APPROVE', body: 'ok', commitId: 'a'.repeat(40) });
      await client.createComment(7, 'noted');
      expect(await client.reviews(7)).toEqual([
        expect.objectContaining({ author: 'ctx-approvals', state: 'APPROVED', body: 'ok', commitId: 'a'.repeat(40) }),
      ]);
      expect(await client.comments(7)).toEqual([expect.objectContaining({ author: 'ctx-approvals', body: 'noted' })]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a failed call with the HTTP status gh printed', async () => {
    const tmp = await makeTmpDir();
    try {
      const forge = await makeFakeForge(tmp.root, { login: 'ctx-approvals', pulls: [] });
      const client = createGhForgeClient(tmp.root, { ...process.env, ...forge.env });
      const error = await client.pull(99).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForgeRequestError);
      expect((error as ForgeRequestError).status).toBe(404);
    } finally {
      await tmp.cleanup();
    }
  });
});
