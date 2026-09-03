// The single record of every third-party component ctxr-cli redistributes.
//
// keep-external-dependencies-current: this module holds the record, its pure
// renderings, and its pure derivations, and nothing else — no network, no
// filesystem, no CLI body.
// That is what lets `scripts/vendor-skills.mjs` and
// `test/unit/vendored-payload-integrity.test.ts` both import it, so the
// pinned revision is asserted from one place instead of drifting between the
// script, each `templates/vendor/<name>/provenance.json`, and
// `THIRD_PARTY_NOTICES.md`.
//
// `scripts/` is absent from package.json's `files`, so nothing here ships.

/**
 * Every vendored skill. Add an entry here, then run
 * `node scripts/vendor-skills.mjs` with no flags.
 *
 * `ref` is the revision the committed payload was fetched at. `track` names
 * the branch `--outdated` resolves "latest" against; `null` freezes an entry,
 * so an upstream contexture has deliberately stopped following can stay
 * vendored without being reported as drifted every week.
 */
export const MANIFEST = [
  {
    name: 'frontend-design',
    repo: 'anthropics/skills',
    subpath: 'skills/frontend-design',
    ref: '53048666b05b4799081517d00e09e0a2dd688678',
    track: 'main',
    license: 'Apache-2.0',
    licenseName: 'Apache License 2.0',
    copyright: 'Anthropic, PBC',
  },
  {
    name: 'eli5',
    repo: 'DreambigOu/ELI5',
    subpath: 'skills/eli5',
    ref: 'a766623b062331fdde53467001379b4ddf3acc2f',
    track: 'main',
    license: 'MIT',
    licenseName: 'MIT License',
    // Upstream publishes no license file inside `skills/eli5` — the
    // repository's own MIT LICENSE is what governs the skill and therefore what
    // travels with it. Repository-relative, and fetched at whatever revision
    // the payload beside it is fetched at.
    licensePath: 'LICENSE',
    // Upstream's LICENSE reads "Copyright (c) 2026" and names no holder.
    // Recording that, rather than inferring the repository's owner (an owner is
    // not necessarily the holder), is the only honest summary for a legal
    // notice we publish; the file itself is redistributed verbatim beside the
    // skill. Asked upstream to fill the holder in:
    // https://github.com/DreambigOu/ELI5/issues/1 — if they do, re-vendor and
    // replace this line with the notice they land on.
    copyright: '2026 — upstream names no holder; see `templates/vendor/eli5/LICENSE.txt`',
  },
];

/** The one name a vendored license is committed, delivered, and compared under — whatever upstream calls it. */
export const LICENSE_FILE_NAME = 'LICENSE.txt';

/**
 * The complete payload for `entry` at one revision, as relativePath -> content:
 * every file under its subpath, plus — when upstream keeps no license beside
 * the skill — that repository's own license, under the single name above.
 *
 * Both the fetch path and the drift check build their picture of upstream
 * through here, and that is the point. If only the fetch path knew that a
 * license came from outside the subpath, `--outdated` would compare a committed
 * LICENSE.txt against a subpath tree that never contains one, and report that
 * skill as drifted every week forever. An alarm that is always on is an alarm
 * nobody reads — including for the entry that is genuinely drifting.
 *
 * Throwing here rather than returning a partial payload is what makes the
 * harness-portability spec's "each vendored skill SHALL be accompanied by its
 * upstream license file" a fetch-time failure instead of a test-time surprise.
 * Inside `outdatedOne` the throw becomes exit 2 ("could not determine"), which
 * is the right reading: an upstream deleting its license is not routine drift.
 */
export function assemblePayload(entry, subpathFiles, externalLicense) {
  const files = new Map(subpathFiles.map((file) => [file.relativePath, file.content]));

  if (entry.licensePath) {
    if (files.has(LICENSE_FILE_NAME)) {
      throw new Error(
        `${entry.name}: upstream now publishes ${LICENSE_FILE_NAME} inside ${entry.subpath} — drop licensePath from the manifest`,
      );
    }
    if (typeof externalLicense !== 'string') {
      throw new Error(`${entry.name}: licensePath is \`${entry.licensePath}\` but no license content was fetched for it`);
    }
    files.set(LICENSE_FILE_NAME, externalLicense);
  } else if (!files.has(LICENSE_FILE_NAME)) {
    throw new Error(
      `${entry.name}: ${entry.repo}/${entry.subpath} has no ${LICENSE_FILE_NAME} — set licensePath to the repository-relative license file`,
    );
  }

  return files;
}

/** The relative paths on which two payloads disagree, sorted; empty means identical. */
export function differingPaths(upstream, committed) {
  const differing = [];
  for (const rel of new Set([...upstream.keys(), ...committed.keys()])) {
    if (upstream.get(rel) !== committed.get(rel)) differing.push(rel);
  }
  return differing.sort();
}

/**
 * Renders `THIRD_PARTY_NOTICES.md` from the manifest.
 *
 * The fetch path rewrites the notices file through this on every re-vendor.
 * Without that, `node scripts/vendor-skills.mjs` — the command a drift issue
 * tells a maintainer to run — would refresh the payload and its provenance
 * record while leaving this file asserting the previous revision, so the
 * repository would misstate what it redistributes.
 */
export function renderNotices(manifest) {
  const lines = [
    '# Third-Party Notices',
    '',
    'ctxr-cli vendors the following third-party components, unmodified, under the templates it ships. Each',
    "one's license file travels with it inside the skill directory it is written into",
    '(`templates/vendor/<name>/LICENSE.txt`). This file records what is vendored, where it came from, and',
    'under what terms.',
    '',
    'To re-vendor at a pinned upstream revision, see `scripts/vendor-skills.mjs`.',
    '',
  ];

  for (const entry of manifest) {
    lines.push(
      `## ${entry.name}`,
      '',
      `- **Source:** https://github.com/${entry.repo}, path \`${entry.subpath}\``,
      `- **Pinned revision:** \`${entry.ref}\``,
      `- **License:** ${entry.licenseName} (see \`templates/vendor/${entry.name}/${LICENSE_FILE_NAME}\`)`,
    );
    // Upstream keeps this one's license outside the vendored subpath, so the
    // notice says where it was taken from rather than implying it shipped
    // beside the skill — the Source line above names only the subpath.
    if (entry.licensePath) {
      lines.push(
        `- **License source:** \`${entry.licensePath}\` in the upstream repository — no license file exists inside \`${entry.subpath}\``,
      );
    }
    lines.push(`- **Copyright:** ${entry.copyright}`, '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
