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
  /**
   * Repository-relative path to the license, set only when upstream publishes
   * none inside `subpath`. Absent — not undefined — otherwise, so an existing
   * provenance record round-trips byte-identical.
   */
  licensePath?: string;
  /** Copyright holder, as it appears in THIRD_PARTY_NOTICES.md. */
  copyright: string;
}

/** One file in a payload, as the fetch path reads it out of the upstream tree. */
export interface VendoredPayloadFile {
  relativePath: string;
  content: string;
}

export declare const MANIFEST: VendoredManifestEntry[];

export declare const LICENSE_FILE_NAME: string;

export declare function renderNotices(manifest: readonly VendoredManifestEntry[]): string;

/**
 * The complete payload at one revision. Throws when the entry names no license
 * anywhere, and when it names one both inside and outside its subpath.
 */
export declare function assemblePayload(
  entry: Pick<VendoredManifestEntry, 'name' | 'repo' | 'subpath' | 'licensePath'>,
  subpathFiles: readonly VendoredPayloadFile[],
  externalLicense: string | undefined,
): Map<string, string>;

/** The relative paths on which two payloads disagree, sorted; empty means identical. */
export declare function differingPaths(
  upstream: ReadonlyMap<string, string>,
  committed: ReadonlyMap<string, string>,
): string[];
