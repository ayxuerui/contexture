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

## Releasing

Publishing to npm is automated: merging to `main` publishes whenever `package.json`'s version isn't
already on the registry, via [`.github/workflows/release.yml`](.github/workflows/release.yml).
Ordinary merges are a no-op — only a version bump triggers a publish.

To cut a release:

```sh
git checkout -b chore/release-X.Y.Z
npm version X.Y.Z --no-git-tag-version   # bumps package.json and package-lock.json together
# hand-edit src/version.ts's CLI_VERSION to match X.Y.Z
```

Open a PR and merge it. The workflow then builds, tests, publishes to npm (via trusted publishing —
no stored token), tags the commit `vX.Y.Z`, and creates a GitHub Release. `test/unit/version-sync.test.ts`
guards against `CLI_VERSION` drifting from `package.json`'s version on every PR.
