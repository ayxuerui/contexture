import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VENDORED_SKILLS } from '../../src/config/defaults.js';
import { MANIFEST, renderNotices, assemblePayload, differingPaths } from '../../scripts/vendored-manifest.mjs';

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
        licensePath?: string;
      };
      expect(provenance.source, `${entry.name}: provenance.source disagrees with the manifest`).toBe(entry.repo);
      expect(provenance.subpath, `${entry.name}: provenance.subpath disagrees with the manifest`).toBe(entry.subpath);
      expect(provenance.ref, `${entry.name}: provenance.ref disagrees with the manifest`).toBe(entry.ref);
      expect(provenance.license, `${entry.name}: provenance.license disagrees with the manifest`).toBe(entry.license);
      expect(provenance.licensePath, `${entry.name}: provenance.licensePath disagrees with the manifest`).toBe(
        entry.licensePath,
      );
    }
  });

  /**
   * vendor-explanation-craft-skill: an upstream may keep no license beside the
   * skill it publishes, in which case the repository's own license is what
   * governs it and therefore what must travel with it. The existing guard above
   * only checks that a LICENSE.txt exists; this one checks that a separately
   * sourced one actually carries terms rather than being an empty placeholder.
   */
  it('a skill whose upstream keeps its license outside the vendored subpath still ships one', async () => {
    const external = MANIFEST.filter((entry) => entry.licensePath !== undefined);
    expect(external.length, 'anti-vacuity: this guard exists for entries with an out-of-subpath license').toBeGreaterThan(
      0,
    );

    for (const entry of external) {
      const license = await readFile(path.join(VENDOR_DIR, entry.name, 'LICENSE.txt'), 'utf8');
      expect(license.trim().length, `templates/vendor/${entry.name}/LICENSE.txt is empty`).toBeGreaterThan(0);
    }
  });

  it('THIRD_PARTY_NOTICES.md is exactly what the manifest renders', async () => {
    const committed = await readFile(NOTICES_PATH, 'utf8');
    expect(committed, 'THIRD_PARTY_NOTICES.md is stale — run `node scripts/vendor-skills.mjs` to regenerate it').toBe(
      renderNotices(MANIFEST),
    );
  });
});

/**
 * The trap this guards, from vendor-explanation-craft-skill's design: the
 * `--outdated` check compares the committed payload against the upstream
 * SUBPATH tree. A license taken from outside that subpath is never in that
 * tree, so unless both sides are assembled the same way, the entry reports
 * OUTDATED every week forever — and a weekly false alarm is a muted alarm,
 * including for the entry that is genuinely drifting. These run without
 * network, which is the only way the hazard is testable at all.
 */
describe('a license sourced from outside the vendored subpath', () => {
  const entry = { name: 'x', repo: 'o/r', subpath: 'skills/x', licensePath: 'LICENSE' };
  const skillFile = { relativePath: 'SKILL.md', content: 'skill\n' };

  it('joins the payload under the name it is committed and compared as', () => {
    const payload = assemblePayload(entry, [skillFile], 'MIT\n');
    expect([...payload.keys()].sort()).toEqual(['LICENSE.txt', 'SKILL.md']);
  });

  it('makes an unchanged payload compare as current, not as perpetually drifted', () => {
    const upstream = assemblePayload(entry, [skillFile], 'MIT\n');
    const committed = new Map([
      ['SKILL.md', 'skill\n'],
      ['LICENSE.txt', 'MIT\n'],
    ]);
    expect(differingPaths(upstream, committed)).toEqual([]);
  });

  it('still reports a genuine upstream license change as drift', () => {
    const upstream = assemblePayload(entry, [skillFile], 'MIT (revised)\n');
    const committed = new Map([
      ['SKILL.md', 'skill\n'],
      ['LICENSE.txt', 'MIT\n'],
    ]);
    expect(differingPaths(upstream, committed)).toEqual(['LICENSE.txt']);
  });

  it('refuses an entry with no license anywhere, and one that names both', () => {
    expect(() => assemblePayload({ ...entry, licensePath: undefined }, [skillFile], undefined)).toThrow(
      /no LICENSE\.txt/,
    );
    expect(() =>
      assemblePayload(entry, [skillFile, { relativePath: 'LICENSE.txt', content: 'x' }], 'MIT\n'),
    ).toThrow(/drop licensePath/);
  });
});
