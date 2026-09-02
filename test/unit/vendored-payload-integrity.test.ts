import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VENDORED_SKILLS } from '../../src/config/defaults.js';
import { MANIFEST, renderNotices } from '../../scripts/vendored-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VENDOR_DIR = path.join(ROOT, 'templates/vendor');
const NOTICES_PATH = path.join(ROOT, 'THIRD_PARTY_NOTICES.md');

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

  /**
   * keep-external-dependencies-current: the pinned revision used to be able
   * to disagree silently across four places — the fetch script's manifest,
   * each skill's provenance.json, THIRD_PARTY_NOTICES.md, and the config
   * default naming which skills ship. `scripts/vendored-manifest.mjs` is now
   * the one source; these assertions fail if any of the other three drift
   * from it instead of leaving the mismatch to be found by hand.
   */
  it('the manifest is the single source of every vendored skill\'s recorded revision', async () => {
    expect(MANIFEST.map((entry) => entry.name).sort()).toEqual([...DEFAULT_VENDORED_SKILLS].sort());

    for (const entry of MANIFEST) {
      const provenance = JSON.parse(await readFile(path.join(VENDOR_DIR, entry.name, 'provenance.json'), 'utf8')) as {
        source: string;
        subpath: string;
        ref: string;
        license: string;
      };
      expect(provenance.source, `${entry.name}: provenance.source disagrees with the manifest`).toBe(entry.repo);
      expect(provenance.subpath, `${entry.name}: provenance.subpath disagrees with the manifest`).toBe(entry.subpath);
      expect(provenance.ref, `${entry.name}: provenance.ref disagrees with the manifest`).toBe(entry.ref);
      expect(provenance.license, `${entry.name}: provenance.license disagrees with the manifest`).toBe(entry.license);
    }
  });

  it('THIRD_PARTY_NOTICES.md is exactly what the manifest renders', async () => {
    const committed = await readFile(NOTICES_PATH, 'utf8');
    expect(committed, 'THIRD_PARTY_NOTICES.md is stale — run `node scripts/vendor-skills.mjs` to regenerate it').toBe(
      renderNotices(MANIFEST),
    );
  });
});
