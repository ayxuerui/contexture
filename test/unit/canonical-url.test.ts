import { describe, expect, it } from 'vitest';
import { canonicalizeSourceId } from '../../src/core/ingest/canonical-url.js';

const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'fbclid'];

describe('canonicalizeSourceId (store-primitives-from-migration-audit D2)', () => {
  it.each([
    ['lowercases the scheme and host', 'HTTPS://Example.COM/a', 'https://example.com/a'],
    ['drops the fragment', 'https://example.com/a#section', 'https://example.com/a'],
    ['strips a configured tracking parameter', 'https://example.com/a?utm_source=x', 'https://example.com/a'],
    ['strips multiple configured tracking parameters', 'https://example.com/a?utm_source=x&utm_medium=y&fbclid=z', 'https://example.com/a'],
    ['keeps a query parameter that is not configured as tracking', 'https://example.com/a?id=42', 'https://example.com/a?id=42'],
    ['collapses a trailing slash', 'https://example.com/a/', 'https://example.com/a'],
    ['never collapses the root path to nothing', 'https://example.com/', 'https://example.com/'],
    ['combines every rule at once', 'HTTPS://Example.COM/a/?utm_source=x&id=1#top', 'https://example.com/a?id=1'],
  ])('%s', (_label, input, expected) => {
    expect(canonicalizeSourceId(input, TRACKING_PARAMS)).toBe(expected);
  });

  it('a non-URL identity passes through unchanged', () => {
    expect(canonicalizeSourceId('granola/abc123', TRACKING_PARAMS)).toBe('granola/abc123');
  });

  it('with no tracking params configured, only case/fragment/trailing-slash rules apply', () => {
    expect(canonicalizeSourceId('HTTPS://Example.com/a/?utm_source=x#top', [])).toBe('https://example.com/a?utm_source=x');
  });

  it('two differently-decorated URLs canonicalize to the same identity (the scenario)', () => {
    const ingested = canonicalizeSourceId('https://Example.com/a/', ['utm_source']);
    const candidate = canonicalizeSourceId('https://example.com/a?utm_source=x#top', ['utm_source']);
    expect(ingested).toBe(candidate);
  });
});
