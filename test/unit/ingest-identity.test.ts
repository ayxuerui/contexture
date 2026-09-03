import { describe, expect, it } from 'vitest';
import {
  hasAssignedIdentity,
  hasSourceIdentity,
  INGESTED_FIELD,
  SOURCE_HASH_FIELD,
  SOURCE_ID_FIELD,
  SOURCE_TYPE_FIELD,
} from '../../src/core/ingest/identity.js';

describe('hasSourceIdentity', () => {
  it('is false for undefined frontmatter (a freshly captured file)', () => {
    expect(hasSourceIdentity({ frontmatter: undefined })).toBe(false);
  });

  it('is false for frontmatter with no source-identity fields', () => {
    expect(hasSourceIdentity({ frontmatter: { title: 'Something' } })).toBe(false);
  });

  it.each([SOURCE_TYPE_FIELD, SOURCE_ID_FIELD, SOURCE_HASH_FIELD, INGESTED_FIELD])(
    'is true when %s is present',
    (field) => {
      expect(hasSourceIdentity({ frontmatter: { [field]: 'anything' } })).toBe(true);
    },
  );
});

describe('hasAssignedIdentity', () => {
  it('is false for a capture a pipeline stamped with where it came from', () => {
    expect(
      hasAssignedIdentity({ frontmatter: { [SOURCE_TYPE_FIELD]: 'article', [SOURCE_ID_FIELD]: 'url/https://example.com/a' } }),
    ).toBe(false);
  });

  it.each([SOURCE_HASH_FIELD, INGESTED_FIELD])('is true once ingest has assigned %s', (field) => {
    expect(hasAssignedIdentity({ frontmatter: { [field]: 'anything' } })).toBe(true);
  });

  it('is false for no frontmatter at all', () => {
    expect(hasAssignedIdentity({ frontmatter: undefined })).toBe(false);
  });
});
