import { describe, expect, it } from 'vitest';
import { scanForSecrets } from '../../src/core/security/secrets.js';

describe('scanForSecrets', () => {
  it('flags an AWS access key id, naming the line', () => {
    const matches = scanForSecrets('line one\nAKIAABCDEFGHIJKLMNOP\nline three');
    expect(matches).toEqual([{ patternId: 'aws_access_key_id', line: 2 }]);
  });

  it('flags a private key header', () => {
    const matches = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n-----END-----');
    expect(matches.some((m) => m.patternId === 'private_key_block')).toBe(true);
  });

  it('flags a GitHub personal access token', () => {
    const matches = scanForSecrets(`token: ghp_${'a'.repeat(36)}`);
    expect(matches.some((m) => m.patternId === 'github_token')).toBe(true);
  });

  it('returns no matches for ordinary content', () => {
    expect(scanForSecrets('# Just a note\n\nNothing secret here.\n')).toEqual([]);
  });

  it('reports multiple matches across multiple lines', () => {
    const content = `AKIAABCDEFGHIJKLMNOP\nnothing\ngh_token: ghp_${'b'.repeat(36)}`;
    const matches = scanForSecrets(content);
    expect(matches).toHaveLength(2);
  });
});
