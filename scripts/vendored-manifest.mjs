// The single record of every third-party component ctxr-cli redistributes.
//
// keep-external-dependencies-current: this module holds the record and its
// pure renderings, and nothing else — no network, no filesystem, no CLI body.
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
];

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
      `- **License:** ${entry.licenseName} (see \`templates/vendor/${entry.name}/LICENSE.txt\`)`,
      `- **Copyright:** ${entry.copyright}`,
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
