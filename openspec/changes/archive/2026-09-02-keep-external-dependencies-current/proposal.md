## Why

`vendored-craft-skills` made contexture a redistributor: `templates/vendor/frontend-design/` ships upstream Apache-2.0 content inside the published package, pinned to `anthropics/skills@53048666`. That change's own design named the consequence as an accepted risk — "a vendored skill goes stale between releases … refreshing is a contexture release, not a store-side action" — but shipped nothing that would ever tell a maintainer a refresh was due. `scripts/vendor-skills.mjs --check` compares the committed payload against its *own* recorded hash, so it catches a hand-edit and is blind to upstream movement by construction. The same blindness sits one layer down: `.github/dependabot.yml` declares only the `github-actions` ecosystem, so `commander`, `zod`, `yaml`, `@inquirer/prompts`, `typescript`, `vitest` and `@types/node` move only when someone remembers to bump them.

Both gaps are the same shape — contexture depends on code it does not author, and nothing observes when that code changes. This change adds the observation, for both, at the repository level.

## What Changes

- **`scripts/vendor-skills.mjs` gains an `--outdated` mode** that resolves each manifest entry's tracked upstream branch, fetches the skill's file tree there, and compares **delivered file content** — every file, not just `SKILL.md` — against `templates/vendor/<name>/`. Reports `current`/`outdated` per entry naming the upstream commit and the differing files, and exits non-zero when anything is outdated. Content comparison rather than revision comparison is load-bearing: the recorded `ref` is a repo-wide SHA across an upstream carrying 19 skills, so comparing revisions would report drift on commits that change nothing contexture ships.
- **A new weekly workflow, `.github/workflows/vendor-check.yml`**, runs `--outdated` and files a GitHub issue when the payload has drifted, naming the skill, the pinned and upstream revisions, the upstream commit, the differing files, and the one command that fixes it. It reuses a single labelled tracking issue rather than opening a new one each week, comments on that issue when drift persists, and closes it once the payload is current again. A changed upstream `LICENSE.txt` is called out separately, because changing redistribution terms is a decision rather than a refresh.
- **The vendoring manifest becomes the single source of the pinned revision.** It moves to `scripts/vendored-manifest.mjs`, the fetch path regenerates `THIRD_PARTY_NOTICES.md` from it, and `test/unit/vendored-payload-integrity.test.ts` gains assertions that the manifest, each `provenance.json`, `THIRD_PARTY_NOTICES.md`, and `DEFAULT_VENDORED_SKILLS` all agree. This is a prerequisite, not a tidy-up: the fix the new issue instructs a maintainer to run (`node scripts/vendor-skills.mjs`) currently updates the payload and its provenance record while leaving the notices file asserting the *previous* revision — so the first use of the new mechanic would ship a third-party notices file that misstates what contexture redistributes.
- **`.github/dependabot.yml` declares the `npm` ecosystem**, weekly, with minor and patch updates batched into one production group and one development group, and majors deliberately left ungrouped so a breaking bump arrives as its own reviewable pull request rather than buried in a batch of patches.
- **BREAKING**: N/A. Nothing a store observes changes. No `src/` file, no template delivered into a store, no command, flag, or configuration key is touched; `ctxr init` and `ctxr update` behave identically and remain offline. `skip_specs: true` — no requirement describes how contexture's own repository observes its upstreams, so there is no requirement to add, modify, or remove.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

_None — no spec-level behavior changes; see the BREAKING note above._

## Non-Goals

- **Opening a pull request automatically instead of an issue.** A bot that re-vendors and proposes the diff would work, but it puts third-party prose — content an agent will later read as instructions — into a branch of this repository before any human has looked at it, and it needs `contents: write` plus a fixed bot branch to do so. The detection was the missing piece; the fix is one local command, so automating the typing buys little and costs review posture.
- **Auto-merging dependency updates.** Same reason, applied to npm: at two or three grouped pull requests a week the human cost is small, and every one of them changes code that ships to users.
- **Fetching vendored skills client-side, at `ctxr init` or `ctxr update`.** Considered and rejected. It would put network access in `src/`, which is deliberately network-free; make `init` non-deterministic and dependent on connectivity, against that command's stated offline guarantee; require HTTP stubbing across the whole `fake-env` test surface; and, decisively, deliver upstream prose to a user's agent as instructions with no human having read it. Keeping refresh in this repository is what preserves the review step.
- **Consuming the upstream skill as an npm or git dependency.** Not available: upstream publishes no npm package and carries no `package.json` anywhere in its tree, so it cannot be a registry dependency or a git dependency. It distributes as a Claude Code plugin marketplace. Vendoring is the only mechanism; this change makes vendoring maintainable rather than replacing it.
- **Tracking the upstream by tag or semver.** `anthropics/skills` publishes neither tags nor releases, so a tracked branch plus content hashing is the only signal that exists.
- **A git submodule with Dependabot's `gitsubmodule` ecosystem.** It would silently publish an empty vendored directory on any checkout without `submodules: true`, raise a bump whenever any of the 19 upstream skills changes rather than the one contexture ships, and force the provenance sidecar out of the skill directory — which `harness-portability` makes the sole ownership mark distinguishing a vendored skill from an operator-authored one.
- **A store-side staleness check in `ctxr doctor`.** `doctor` stays offline, and a store cannot act on the answer anyway: refreshing the payload is a contexture release.

## Impact

- **New files**: `scripts/vendored-manifest.mjs` (the manifest, extracted so a test can import it without executing the CLI script's top-level body), `.github/workflows/vendor-check.yml`.
- **Changed**: `scripts/vendor-skills.mjs` (imports the extracted manifest, gains `--outdated`, regenerates the notices file on fetch), `.github/dependabot.yml` (adds the `npm` ecosystem), `test/unit/vendored-payload-integrity.test.ts` (single-source assertions).
- **Not changed**: everything under `src/`, every file under `templates/`, and the published package's contents. `scripts/` is absent from `package.json`'s `files`, so the extracted manifest ships nowhere.
- **CI and release**: unaffected. `ci.yml` already runs on `pull_request`, which is the event Dependabot raises, so grouped bumps are verified on both matrix Node versions with no workflow change. Merging a bump does not publish — `release.yml`'s publish job is gated on `published == 'false' || tag_exists == 'false'`, and a dependency bump changes neither.
- **Permissions**: the new workflow needs `issues: write` and `contents: read`, and is guarded on `github.repository` so forks stay quiet. No workflow gains write access to repository contents.
- **Ongoing cost**: one scheduled run a week, plus roughly two or three dependency pull requests a week to review.
