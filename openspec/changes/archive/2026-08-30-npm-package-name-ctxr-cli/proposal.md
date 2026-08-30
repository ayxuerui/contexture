## Why

The first `npm publish` of `ctxr` was refused by the registry's package-name similarity check (`403: Package name too similar to existing packages cpr,cpx,cbor,tar`). The check is weighted toward popular packages, and a four-letter unscoped name is almost always within two edits of one — so the "one string for install, `npx`, and the prompt" goal from `cli-distribution-identity` cannot hold for `ctxr`. The executable name is the part users type every day; the install string is typed once.

## What Changes

- The npm package is `ctxr-cli`; the executable stays `ctxr` (with the `contexture` compatibility alias). `npm install -g ctxr-cli` puts `ctxr` on PATH — the conventional `<cmd>-cli` → `<cmd>` pattern.
- The cli-contract requirement that bound the package name to the executable name is modified to bind both names explicitly and to record why they differ.
- README install instructions, the package manifest and lockfile, the manifest unit test, and the OpenSpec project context follow.
- **BREAKING**: N/A — nothing was ever published under `ctxr`, and no store-resident or generated surface names the package.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `cli-contract`: the "distributed and invoked as `ctxr`" requirement now names `ctxr-cli` as the npm package and drops the claim that install name and executable name are one string.

## Impact

`package.json` / `package-lock.json` (`name`), `README.md` (install), `test/unit/cli-name.test.ts` (manifest assertion), `openspec/config.yaml` (project context), `openspec/specs/cli-contract/spec.md` (via sync).

## Non-goals

- **Renaming the executable.** `ctxr` is unaffected by the registry check (it is a bin name, not a package name) and is the name every generated surface, hook, and doc already uses.
- **A scoped package (`@ayxuerui/ctxr`, npm's suggestion).** Guaranteed to pass the check, but it bakes a personal username into the install string permanently for an org-oriented tool; `@contexture/ctxr` would need an org whose availability could not be confirmed. Revisit if `ctxr-cli` is also refused.
- **Rewriting the archived `cli-distribution-identity` artifacts.** They are the record of the original decision; the main spec is the authority and is what this change updates.
