import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VENDORED_SKILLS } from '../../src/config/defaults.js';

const VENDOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/vendor');

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * harness-portability spec (vendored-craft-skills): guards the committed
 * `templates/vendor/**` payload against silent hand-editing. A vendored
 * skill's provenance record pins the hash of the SKILL.md contexture
 * actually delivers into a store — if the committed file and its recorded
 * hash ever disagree, `syncVendoredSkills` would deliver content whose
 * provenance record lies about what it is. This is the same check
 * `scripts/vendor-skills.mjs --check` runs for a maintainer re-vendoring by
 * hand; this test is what makes the same guarantee run in CI.
 */
describe('vendored payload integrity', () => {
  it('every vendored skill exists under templates/vendor/ with a matching provenance hash', async () => {
    expect(DEFAULT_VENDORED_SKILLS.length).toBeGreaterThan(0); // anti-vacuity

    for (const name of DEFAULT_VENDORED_SKILLS) {
      const dir = path.join(VENDOR_DIR, name);
      const skillMd = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
      const provenance = JSON.parse(await readFile(path.join(dir, 'provenance.json'), 'utf8')) as { sha256: string };

      expect(sha256(skillMd), `templates/vendor/${name}/SKILL.md does not match its recorded provenance hash`).toBe(
        provenance.sha256,
      );
    }
  });

  it('every vendored skill ships its upstream license file', async () => {
    for (const name of DEFAULT_VENDORED_SKILLS) {
      const dir = path.join(VENDOR_DIR, name);
      const entries = await readdir(dir);
      expect(entries, `templates/vendor/${name}/ has no LICENSE.txt`).toContain('LICENSE.txt');
    }
  });
});
