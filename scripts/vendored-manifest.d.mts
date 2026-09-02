// Types for the maintainer-side manifest module, so
// `test/unit/vendored-payload-integrity.test.ts` can import it under the
// project's `strict` settings without `allowJs`. The module itself stays
// plain ESM, since `scripts/vendor-skills.mjs` runs it under bare `node`
// with nothing installed.

export interface VendoredManifestEntry {
  /** Skill directory name under templates/vendor/, equal to its SKILL.md frontmatter name. */
  name: string;
  /** Upstream repository, `owner/repo`. */
  repo: string;
  /** Path to the skill directory within that repository. */
  subpath: string;
  /** Revision the committed payload was fetched at. */
  ref: string;
  /** Branch `--outdated` resolves "latest" against; `null` freezes the entry. */
  track: string | null;
  /** SPDX identifier. */
  license: string;
  /** Human-readable license name, as it appears in THIRD_PARTY_NOTICES.md. */
  licenseName: string;
  /** Copyright holder, as it appears in THIRD_PARTY_NOTICES.md. */
  copyright: string;
}

export declare const MANIFEST: VendoredManifestEntry[];

export declare function renderNotices(manifest: readonly VendoredManifestEntry[]): string;
