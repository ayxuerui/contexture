# Contributing to Contexture

Thanks for taking a look. Issues and pull requests are welcome; if you are proposing a
behavior change rather than a fix, read the spec-first note under Development below before
you start writing code.

## Development

```sh
npm run build
npm test
npm run typecheck
```

Behavior changes are specified before they're implemented: see `openspec/specs/` for the capability specs and `openspec/changes/` for in-flight proposals. Prose that ships into a store — skill bodies, `AGENTS.md` sections — is authored as markdown under `templates/`, never as string literals in TypeScript.

## Measuring the second opinion

`npm run eval:second-opinion` measures a critique against the seeded plans under `test/fixtures/second-opinion-eval/plans/`. Each plan carries an answer key of planted defects. The script sends every plan to the four model families through OpenRouter under the shipped critique prompt and under a comparison of one request for each role, has three families judge each finding against the key, and reports the share of planted defects found.

Run it when a shipped model or the critique prompt changes. It is not part of `npm test`: it needs `OPENROUTER_API_KEY`, and a full run of three repetitions cost about 46 US dollars of answers, with the judging on top, in November 2026.

```bash
npm run eval:second-opinion -- run --reps 3
npm run eval:second-opinion -- judge
npm run eval:second-opinion -- report
```

Answers and judgements are kept under `--out` (a folder in the system's temporary directory by default), so an interrupted run resumes. `--plans p1,h2` limits the plans. Record a run worth keeping in `test/fixtures/second-opinion-eval/recorded.json`. To add a plan, add one file: the plan in the skill's shape, a line `=====KEY=====`, then one line for each planted defect as `id | role | step | what counts as finding it`.

## Changing the store's shape

A change that renames, moves or removes a key a store may have recorded in `contexture.yaml` raises
`SUPPORTED_SCHEMA_VERSION` (`src/config/schema.ts`) and, in the same change, adds the step from the
previous version to `MIGRATION_STEPS` (`src/config/migrations.ts`), with a byte-exact fixture test of
its own. `ctxr update` runs the steps against the raw document, so the typed schema keeps only the new
spelling. `test/unit/config-migrations.test.ts` fails if a version has no step, or if a retired spelling
is still declared. A changed *shipped default* is not a shape change and needs none of this: a store
that never recorded the key follows the new default on its own.

## Releasing

Publishing to npm is automated: merging to `main` publishes whenever `package.json`'s version isn't
already on the registry, via [`.github/workflows/release.yml`](.github/workflows/release.yml).
Ordinary merges are a no-op — only a version bump triggers a publish.

To cut a release:

```sh
git checkout -b chore/release-X.Y.Z
npm version X.Y.Z --no-git-tag-version   # bumps package.json and package-lock.json together
# hand-edit src/version.ts's CLI_VERSION to match X.Y.Z
npm run plugin                            # regenerates plugins/contexture/ at the new version
```

Commit `plugins/contexture/` with the version bump. Its `plugin.json` version is what tells a member's
Claude that a new copy exists, so the plugin reaches members exactly when the release merges, and
`test/unit/plugin-committed.test.ts` fails the PR when the committed plugin differs from a fresh build or
from `package.json`'s version. The same test fails any PR that changes a skill template or the shared opening section
without running `npm run plugin`.

Open a PR and merge it. The workflow then builds, tests, publishes to npm (via trusted publishing —
no stored token), tags the commit `vX.Y.Z`, and creates a GitHub Release. `test/unit/version-sync.test.ts`
guards against `CLI_VERSION` drifting from `package.json`'s version on every PR.
