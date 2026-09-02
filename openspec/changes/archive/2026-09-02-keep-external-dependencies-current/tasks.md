## 1. Single-source the vendoring manifest

- [x] 1.1 Create `scripts/vendored-manifest.mjs` exporting `MANIFEST` — the array currently inlined in `scripts/vendor-skills.mjs` — with each entry gaining a `track` field naming the branch "latest" resolves against (`'main'` for `frontend-design`), or `null` to freeze the entry. Data and its pure renderings only; no network, no filesystem, no CLI body, so a test can import it freely.
- [x] 1.2 Add `renderNotices(manifest)` to the same module: returns the full `THIRD_PARTY_NOTICES.md` text as a function of the manifest alone, byte-identical to the committed file for the current manifest.
- [x] 1.3 Change `scripts/vendor-skills.mjs` to import `MANIFEST` and `renderNotices` instead of declaring the manifest, and have its fetch path write `THIRD_PARTY_NOTICES.md` from `renderNotices(MANIFEST)` after writing each payload — so the command the new issue instructs no longer leaves the notices file asserting the previous revision.
- [x] 1.4 Extend `test/unit/vendored-payload-integrity.test.ts` (do not add a file — it already hashes `SKILL.md` against `provenance.json`) with three assertions: manifest entry names equal `DEFAULT_VENDORED_SKILLS` from `src/config/defaults.ts`; each entry's `ref`, `source`, `subpath` and `license` equal its `templates/vendor/<name>/provenance.json`; and the committed `THIRD_PARTY_NOTICES.md` equals `renderNotices(MANIFEST)`.
- [x] 1.5 Verify: `npx vitest run test/unit/vendored-payload-integrity.test.ts --exclude '**/.claude/**'` passes, and `node scripts/vendor-skills.mjs --check` still prints `OK: frontend-design matches its recorded hash` and exits 0.

## 2. Content-based drift detection

- [x] 2.1 Add an `--outdated` mode to `scripts/vendor-skills.mjs`. For each manifest entry with a non-`null` `track`: resolve that branch's HEAD SHA, fetch the subpath's file tree there with the existing `fetchTree`, and compare every fetched file's bytes against `templates/vendor/<name>/` (excluding `provenance.json`, which contexture authors). Skip entries with `track: null`, reporting them as frozen.
- [x] 2.2 Report per entry: `current`, or `outdated` naming the pinned ref, the resolved upstream ref, the files whose bytes differ, and the subject and URL of the most recent upstream commit touching the subpath (`repos/<repo>/commits?path=<subpath>&per_page=1`). Call out a differing `LICENSE.txt` distinctly from a differing `SKILL.md`.
- [x] 2.3 Implement the three exit codes from design.md — `0` current, `1` drift detected, `2` could not determine (API error, rate limit, missing subpath) — wrapping the fetch calls so a thrown error becomes exit 2 with its message rather than an unhandled rejection. Leave the existing default-fetch and `--check` modes' behavior unchanged.
- [x] 2.4 Verify against the live upstream: `node scripts/vendor-skills.mjs --outdated` reports `frontend-design: current` and exits 0 (`echo $?`). Then temporarily edit the manifest `ref` to `2235be7c60b551f5de82ade908fd3816455afcda`, confirm the run still reports `current` — proving the comparison is content-based, not revision-based — and temporarily corrupt a byte in `templates/vendor/frontend-design/SKILL.md` to confirm it reports `outdated`, names that file, and exits 1. Revert both edits and re-run `node scripts/vendor-skills.mjs --check` to confirm a clean tree.

## 3. The weekly workflow

- [x] 3.1 Write `.github/workflows/vendor-check.yml`: `on: schedule` (weekly) plus `workflow_dispatch`; job guarded with `if: github.repository == 'ayxuerui/contexture'` as `release.yml` does; `permissions: { contents: read, issues: write }`; `GH_TOKEN: ${{ github.token }}`. Steps are checkout and `actions/setup-node`, both pinned to the same commit SHAs `ci.yml` uses, then the script — no `npm ci`, since `vendor-skills.mjs` has no npm dependencies.
- [x] 3.2 Run `--outdated` in a step that captures its exit code without failing the job, then branch on it: `2` fails the job loudly; `1` files or updates the tracking issue; `0` closes an open one.
- [x] 3.3 Implement the single-tracking-issue behavior with `gh issue list --label vendored-skill-update --state open`: comment on the existing issue when one is open, create one labelled `vendored-skill-update` when none is, and on exit code `0` close any open one with a comment noting the payload is current again. Identity comes from the label, never the title. Add the `dependencies` label alongside when a `LICENSE.txt` difference was reported.
- [x] 3.4 Write the issue body from the `--outdated` output: the skill, pinned ref → upstream ref, the upstream commit subject and link, which files differ, and the remediation — `node scripts/vendor-skills.mjs && npm test`, reviewed and merged as an ordinary pull request.
- [x] 3.5 Verify: the file parses as YAML — `node --input-type=module -e "import {parse} from 'yaml'; import {readFileSync} from 'node:fs'; parse(readFileSync('.github/workflows/vendor-check.yml','utf8')); console.log('yaml ok')"` — and running the job's own step sequence locally (`node scripts/vendor-skills.mjs --outdated; echo "exit=$?"`) reproduces the exit code the workflow branches on.

## 4. npm dependency updates

- [x] 4.1 Add the `npm` ecosystem to `.github/dependabot.yml`: `directory: /`, `schedule.interval: weekly`, `commit-message.prefix: chore` to match the existing `github-actions` entry, and two groups — `production-dependencies` (`dependency-type: production`, `update-types: [minor, patch]`) and `development-dependencies` (`dependency-type: development`, `update-types: [minor, patch]`). Add no `major` to either group, so majors stay ungrouped and arrive as individual pull requests.
- [x] 4.2 Verify: `node --input-type=module -e "import {parse} from 'yaml'; import {readFileSync} from 'node:fs'; const c=parse(readFileSync('.github/dependabot.yml','utf8')); console.log(c.updates.map(u=>u['package-ecosystem']).join(','))"` prints `github-actions,npm`.

## 5. Full verification

- [x] 5.1 `npm run typecheck && npm run build && npx vitest run --exclude '**/.claude/**'` — full suite green, confirming nothing under `src/` or `templates/` was disturbed.
- [x] 5.2 `npm pack --dry-run` — the published file list is unchanged and contains no `scripts/` entry.
- [x] 5.3 `git status --porcelain` reports only the intended files: `scripts/vendored-manifest.mjs`, `scripts/vendor-skills.mjs`, `.github/workflows/vendor-check.yml`, `.github/dependabot.yml`, `test/unit/vendored-payload-integrity.test.ts`, and this change's artifacts.

## 6. Post-merge confirmation

These cannot be exercised before the workflow file is on the default branch; they are the completion criteria after the pull request lands, not before.

- [x] 6.1 `gh workflow run vendor-check.yml` then `gh run watch` — the manual dispatch succeeds, reports `frontend-design: current`, and files no issue.
- [x] 6.2 `gh api repos/ayxuerui/contexture/issues --jq '[.[] | select(.labels[].name == "vendored-skill-update")] | length'` prints `0`, confirming the clean-state path opens nothing.
- [x] 6.3a Confirm Dependabot accepted the config: post-merge, its update job ran the `npm_and_yarn` ecosystem, read both `production-dependencies` and `development-dependencies` groups correctly ("Found 2 group(s)"), and checked all seven declared dependencies. No update was needed for any of them, so no pull request was opened this run — nothing was currently outdated at merge time.
- [ ] 6.3b The first grouped pull request lands with `ci.yml` green on both matrix Node versions. Deferred: this needs an actual minor/patch bump to become available upstream, which did not happen within this session. Verify whenever Dependabot's first `npm` group PR appears.
