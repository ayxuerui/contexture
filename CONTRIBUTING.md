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
```

Open a PR and merge it. The workflow then builds, tests, publishes to npm (via trusted publishing —
no stored token), tags the commit `vX.Y.Z`, and creates a GitHub Release. `test/unit/version-sync.test.ts`
guards against `CLI_VERSION` drifting from `package.json`'s version on every PR.
