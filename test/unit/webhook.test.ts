import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitlabHintOf, hintOf, readWebhookSecret, signatureValid, tokenValid } from '../../src/core/browse/webhook.js';
import { WebhookSecretError } from '../../src/core/errors.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const sign = (secret: string, body: Buffer) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('the webhook', () => {
  it('reads the secret from the environment variable or the file it names, and from nowhere else', async () => {
    expect(await readWebhookSecret({})).toBeNull();
    expect((await readWebhookSecret({ CONTEXTURE_WEBHOOK_SECRET: 's3' }))!.toString()).toBe('s3');
    const tmp = await makeTmpDir();
    try {
      const file = path.join(tmp.root, 'secret');
      await writeFile(file, 'from-a-file\n');
      expect((await readWebhookSecret({ CONTEXTURE_WEBHOOK_SECRET_FILE: file }))!.toString()).toBe('from-a-file');
      await expect(readWebhookSecret({ CONTEXTURE_WEBHOOK_SECRET: 's3', CONTEXTURE_WEBHOOK_SECRET_FILE: file })).rejects.toThrow(WebhookSecretError);
      await expect(readWebhookSecret({ CONTEXTURE_WEBHOOK_SECRET_FILE: path.join(tmp.root, 'missing') })).rejects.toThrow(WebhookSecretError);
      await writeFile(file, '\n');
      await expect(readWebhookSecret({ CONTEXTURE_WEBHOOK_SECRET_FILE: file })).rejects.toThrow(WebhookSecretError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('verifies X-Hub-Signature-256 over the raw body', () => {
    const body = Buffer.from('{"ref":"refs/heads/main"}');
    const secret = Buffer.from('s3');
    expect(signatureValid(secret, body, sign('s3', body))).toBe(true);
    expect(signatureValid(secret, body, sign('other', body))).toBe(false);
    expect(signatureValid(secret, Buffer.from('{"ref":"refs/heads/main" }'), sign('s3', body))).toBe(false);
    expect(signatureValid(secret, body, undefined)).toBe(false);
    expect(signatureValid(secret, body, 'sha256=abc')).toBe(false);
    expect(signatureValid(secret, body, `sha1=${createHmac('sha1', 's3').update(body).digest('hex')}`)).toBe(false);
    expect(signatureValid(secret, body, [sign('s3', body)])).toBe(false);
  });

  it('reads only the branch from a delivery', () => {
    const json = (value: unknown) => Buffer.from(JSON.stringify(value));
    expect(hintOf('push', json({ ref: 'refs/heads/main', repository: { full_name: 'example/ctx-a' } }), 'main')).toEqual({ kind: 'default-branch', repository: 'example/ctx-a' });
    expect(hintOf('push', json({ ref: 'refs/heads/session/ctx-a' }), 'main')).toEqual({ kind: 'branch', branch: 'session/ctx-a', repository: null });
    expect(hintOf('pull_request', json({ pull_request: { head: { ref: 'session/ctx-b' } } }), 'main')).toEqual({ kind: 'branch', branch: 'session/ctx-b', repository: null });
    expect(hintOf('push', json({ ref: 'refs/tags/v1' }), 'main').kind).toBe('ignored');
    expect(hintOf('ping', json({}), 'main').kind).toBe('ignored');
    expect(hintOf('issues', json({}), 'main').kind).toBe('ignored');
    expect(hintOf('push', Buffer.from('not json'), 'main').kind).toBe('ignored');
  });

  it('verifies a GitLab delivery by its X-Gitlab-Token, whatever its length (support-gitlab-as-a-forge D8)', () => {
    const secret = Buffer.from('s3cret');
    expect(tokenValid(secret, 's3cret')).toBe(true);
    expect(tokenValid(secret, 's3cre')).toBe(false);
    expect(tokenValid(secret, 's3cret-and-more')).toBe(false);
    expect(tokenValid(secret, '')).toBe(false);
    expect(tokenValid(secret, undefined)).toBe(false);
    expect(tokenValid(secret, ['s3cret'])).toBe(false);
  });

  it('reads only the event, the project path and the branch from a GitLab delivery', () => {
    const body = (payload: unknown) => Buffer.from(JSON.stringify(payload));
    const project = { path_with_namespace: 'ctx-a/team/work' };
    expect(gitlabHintOf('Push Hook', body({ object_kind: 'push', ref: 'refs/heads/main', project }), 'main')).toEqual({ kind: 'default-branch', repository: 'ctx-a/team/work' });
    expect(gitlabHintOf('Push Hook', body({ ref: 'refs/heads/session/ctx-a', project }), 'main')).toEqual({ kind: 'branch', branch: 'session/ctx-a', repository: 'ctx-a/team/work' });
    expect(gitlabHintOf('Merge Request Hook', body({ object_attributes: { source_branch: 'session/ctx-a', target_branch: 'main' } }), 'main')).toEqual({
      kind: 'branch',
      branch: 'session/ctx-a',
      repository: null,
    });
    expect(gitlabHintOf('Push Hook', body({ ref: 'refs/tags/v1' }), 'main')).toEqual({ kind: 'ignored', reason: 'no branch named' });
    expect(gitlabHintOf('Note Hook', body({}), 'main').kind).toBe('ignored');
    // GitHub's event names mean nothing on the GitLab route.
    expect(gitlabHintOf('push', body({ ref: 'refs/heads/main' }), 'main').kind).toBe('ignored');
    expect(gitlabHintOf('Push Hook', Buffer.from('not json'), 'main')).toEqual({ kind: 'ignored', reason: 'the body is not JSON' });
  });
});
