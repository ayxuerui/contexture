## Context

See `proposal.md` — Why. Three properties of the existing code shape the approach.

`scripts/vendor-skills.mjs` is a maintainer tool that already knows how to fetch: `fetchTree` walks a repository subpath at a ref through `gh api` and returns `{ relativePath, content }` for every file, and `fetchOne` writes that tree into `templates/vendor/<name>/` alongside a `provenance.json` recording source, subpath, ref, license, and the SHA-256 of `SKILL.md`. Detection needs the fetch half of that and none of the write half, so it is a third mode on an existing script rather than new machinery.

The recorded `ref` is the upstream repository's HEAD at vendoring time, not the last commit touching the vendored subpath. Upstream carries 19 skills under one repository; contexture ships one. So the pinned identifier moves constantly for reasons that never touch the bytes contexture redistributes.

The script imports only Node builtins and shells out to `gh`. It has no npm dependencies, which is what lets the workflow that runs it skip installation entirely.

## Goals / Non-Goals

**Goals:**
- Detect that an upstream contexture redistributes has changed, without a maintainer having to remember to look.
- Keep every byte of third-party content in front of a human before it enters the published package.
- Add no network access, no dependency, and no behavior to anything a store runs.
- Make the remediation path leave no artifact behind that still asserts the old revision.

**Non-Goals:** see `proposal.md` — Non-Goals. At the design level additionally: no generalization of the fetch layer into a reusable client, and no attempt to diff or summarize upstream *prose* changes. The issue reports which files differ and links the upstream commit; reading the diff is the reviewer's job and is exactly the step this design exists to preserve.

## Decisions

**Detection compares content, not revisions.** `--outdated` resolves the tracked branch's HEAD, fetches the subpath's file tree there, and compares each file's bytes against the committed payload. The obvious alternative — compare the manifest's `ref` against upstream HEAD — was rejected because it is wrong far more often than it is right: with 19 skills behind one repository-wide SHA, almost every upstream commit would report drift in a skill whose bytes are unchanged. A watchdog that fires weekly on a false signal is one that gets muted, which is indistinguishable from not having built it. Comparing every delivered file rather than just `SKILL.md` matters for the same reason the payload ships `LICENSE.txt` at all: a licence that changed underneath a redistribution is the most important thing this mechanism could ever detect, and the existing `provenance.json` hash covers only `SKILL.md`.

**Three exit codes, so a broken watchdog cannot look like a quiet one.** `--outdated` exits 0 for current, 1 for drift detected, and 2 for a failure to determine the answer — an unreachable API, a rate limit, a subpath that upstream renamed or deleted. Collapsing 1 and 2, the naive shape, would file a "the skill is out of date" issue whenever GitHub had a bad minute, and would describe a deleted upstream as routine drift. The workflow treats 2 as a job failure so it surfaces as a red run rather than as a misleading issue.

**The result is an issue, not a pull request.** A bot that re-vendored and opened a PR was considered and is a normal pattern, but it needs `contents: write` and a bot branch, and it lands third-party prose — content an agent later reads as instructions — in this repository before a human has read a word of it. The missing capability was *noticing*; the remediation is already a single command. So the automation stops at the notification boundary and the workflow holds no write access to repository contents. A side effect worth naming: because nothing is committed automatically, the job needs no verification step of its own, and the maintainer's own `npm test` on a normal pull request remains the only gate — one path, not two.

**One tracking issue, reused and auto-closed.** Drift persists until someone acts, and the job runs weekly, so the naive implementation opens an unbounded series of duplicate issues. Instead the workflow looks for an open issue carrying a fixed label, comments on it when one exists, opens one when it does not, and closes it once `--outdated` reports current again. The label is the identity, not the title, so an edited title does not orphan the tracker. This keeps the signal proportional to the problem: one open item, whose comment history shows how long it has been outstanding.

**The manifest moves to its own module.** `test/unit/vendored-payload-integrity.test.ts` needs to read the manifest to assert the recorded revisions agree, but `scripts/vendor-skills.mjs` runs its CLI body at import. The alternatives were guarding that body behind a `process.argv[1]`-versus-`import.meta.url` comparison, or duplicating the manifest into the test. Extracting `scripts/vendored-manifest.mjs` avoids both: one module whose only job is to hold the record, imported by the script and the test alike. `scripts/` is not in `package.json`'s `files`, so this adds nothing to the published package.

**A `track` field states how "latest" is resolved, per entry.** Today "latest" is implicit and undefined. Each manifest entry gains the branch to resolve against, with `null` meaning "frozen — never report this entry as outdated." Without the escape hatch, the only way to stop the mechanism reporting an upstream contexture has deliberately stopped following is to delete the entry, which also deletes the provenance the payload needs.

**Regenerating the notices file is part of this change, not a follow-up.** `THIRD_PARTY_NOTICES.md` states the pinned revision in prose and is maintained by hand, so running `node scripts/vendor-skills.mjs` — the exact command the new issue instructs — refreshes the payload and its `provenance.json` and leaves the notices file asserting the previous revision. Shipping the detector without this would mean the mechanism's first success produces a repository that misstates what it redistributes. Rendering the notices from the manifest on fetch, and asserting agreement in the existing integrity test, closes it in the same change.

**The workflow installs nothing.** `vendor-skills.mjs` imports `node:child_process`, `node:crypto`, `node:fs`, `node:path` and `node:url`, and calls `gh`, which is preinstalled on GitHub-hosted runners. So the job is checkout, set up Node, run. Adding `npm ci` out of habit would make a watchdog's reliability depend on the dependency tree it is watching.

**Dependency updates group minors and patches, and leave majors alone.** Ungrouped, seven packages produce up to seven pull requests a week on a repository this size; fully grouped, a breaking `typescript` or `zod` major arrives inside a batch of routine patches where it is easy to approve without noticing. Two groups — production and development, minor and patch only — leave majors matching no group, so Dependabot opens each one individually with its own CI signal. `ci.yml` already runs on `pull_request` and already spans both supported Node versions, so the version floor in `engines` is enforced by a job that exists rather than by review.

## Risks / Trade-offs

- **The mechanism depends on a human acting on the issue, and an ignored issue is a stale payload with extra steps.** → Accepted; it is the same trade every notification-based control makes. The weekly comment on a persisting issue makes the age visible rather than letting a single stale open item blend into the backlog, and the issue closes itself when the payload is refreshed, so an open one always means a real outstanding decision.
- **GitHub API rate limits.** Unauthenticated `gh api` allows 60 requests an hour per address, and `fetchTree` costs one call per directory plus one per file. → For the current payload that is a handful of calls once a week, and the workflow runs with `GH_TOKEN`, which raises the ceiling far beyond anything this manifest could reach. A rate-limited run exits 2 and fails the job rather than filing a wrong issue.
- **A silently broken watchdog.** A workflow that errors every week looks the same as one that finds nothing, if nobody checks. → The exit-code split is the primary mitigation: anything other than a clean answer fails the job, and a failing scheduled workflow is reported by GitHub to the repository owner.
- **Upstream could rename or delete the vendored subpath.** → That is a fetch failure, not drift: exit 2, red run, and a maintainer decides whether to re-point the manifest, freeze the entry with `track: null`, or drop the skill. Reporting it as ordinary drift would invite a re-vendor against a path that no longer exists.
- **Grouped dependency updates can hide which package caused a failure.** → The full suite runs on the group's pull request, and a red group is a signal to split it by hand; majors, the likeliest breakers, are never grouped in the first place.
- **A Dependabot configuration error is easy to miss**, since a malformed ecosystem entry simply produces no pull requests. → The task list includes confirming the npm ecosystem appears in the repository's dependency-graph view after merge, rather than treating the file as done when it parses locally.

## Migration Plan

Purely additive tooling. No configuration, template, published artifact, or store-visible behavior changes, so there is nothing to migrate and no compatibility surface. The first scheduled run should be triggered manually via `workflow_dispatch` after merge to confirm it reports `current` and files nothing — the honest first assertion, since the payload is currently in sync with upstream. Rollback is deleting `.github/workflows/vendor-check.yml` and the `npm` block in `.github/dependabot.yml`; the manifest extraction and notices generation stand on their own and would be kept.
