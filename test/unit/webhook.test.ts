import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hintOf, readWebhookSecret, signatureValid } from '../../src/core/browse/webhook.js';
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
});
