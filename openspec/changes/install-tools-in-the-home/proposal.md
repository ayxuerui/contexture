## Why

Agents install tools for themselves: a CLI a skill needs, a newer `ctxr` through `ctxr-upgrade`, a
converter for one ingest. Nothing a store renders says how, so an agent improvises, and the two
ways it goes wrong are both costly:

- **It escalates.** Told that `npm install -g` failed with EACCES, an agent reaches for `sudo` or
  for a system path. On a laptop that changes the machine behind the operator's back. In a
  container it fails or, worse, succeeds in a layer the next image pull throws away.
- **It installs where nothing keeps it.** contexture-images' runtime image now installs every
  harness and tool into the agent's home with the publisher's own installer, and backs the whole
  home up; `npm install -g` there goes to a user prefix (`NPM_CONFIG_PREFIX=~/.local`). A tool an
  agent installs the same way survives a recreate and a restore. One installed anywhere else does
  not.

**`ctxr` misreads a user prefix as a non-global install.** `ctxr version --check` decides
"global" by looking under Node's own prefix (`<dir of node>/../lib/node_modules`) and nothing else.
A global install under npm's configured prefix -- `NPM_CONFIG_PREFIX`, or the
`npm config set prefix ~/.npm-global` that npm's own EACCES guide recommends -- is reported as
`install_kind: undetermined`, and `ctxr-upgrade` stops on it. Measured in the runtime image on
2026-10-26: the agents' `ctxr` at `/home/agent/.local/lib/node_modules/ctxr-cli` reports
`undetermined`, so the in-place upgrade from a session that the image was changed to allow is still
refused.

The upgrade skill also has a gap at its one install step. Its `install_writable: false` branch
says the executable "is managed by whatever installed it" and names a newer container image as the
remedy. That was right while the image baked `ctxr` in. The runtime image now carries no `ctxr`
at all -- it is installed into the home -- and the remaining unwritable case, on any machine, is a
root-owned npm prefix: the remedy is a prefix in the home, which the skill never names.

## What Changes

- **The baseline conventions gain a short "Installing tools" rule** (`templates/conventions/
  baseline-conventions.md`): install a tool as your own user, with its publisher's own installer,
  into your home; never with `sudo`, never into the store; `npm install -g` when npm's global
  prefix is in the home, and when it is not writable, report and stop rather than escalate.
- **`ctxr-upgrade`'s unwritable branch names the remedy** (`templates/skills/ctxr-upgrade.md`):
  never retry with `sudo`; report `install_path` and stop; tell the operator that a global npm
  prefix in the home makes the next install writable, and that an executable that shipped in a
  container image is upgraded by a newer image.
- **`ctxr version` reports `global` exactly when `npm install -g` would replace the running
  executable**: the path is under the prefix npm writes to, read from `NPM_CONFIG_PREFIX` /
  `npm_config_prefix` or else `npm prefix -g`, and `install_writable` is judged there. An install
  under Node's own prefix that npm would not replace becomes `undetermined`; Node's prefix is used
  only when npm cannot be asked. A local project dependency stays `undetermined`.
- The `cli-contract` requirement for the version report and the `harness-portability`
  requirements for the baseline conventions and the upgrade skill are amended to match.

No command, flag, configuration key or output field is added; one field's value is corrected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-contract`: the version report classifies an install as global exactly when it lies under
  the prefix a package-manager global install writes to, and judges its writability there.
- `harness-portability`: the baseline conventions carry an install rule; the upgrade skill's
  unwritable-install branch names the user-prefix remedy and forbids escalation.

## Impact

- `src/core/install-kind.ts`, `src/commands/version.ts` and their tests.
- `templates/conventions/baseline-conventions.md`, `templates/skills/ctxr-upgrade.md`, and the
  tests that assert their rendered content.
- Every store's `AGENTS.md` grows by the new section (about 400 bytes) on its next `ctxr update`.
  agy's 24 KB `AGENTS.md` limit binds on the largest stores, so the section stays two bullets.
- Out of scope: how a deployment provides a writable prefix. That is the environment's job,
  documented in contexture-images for the runtime image.
