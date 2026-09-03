## Why

An operator who installed `ctxr` six months ago has no way to learn that they are six releases behind. There is no update notice, no staleness check, and no `ctxr --version` at all — `program.version()` is never called, so `ctxr --version` exits with the usage code as an unknown option, and the installed version is observable only inside a `--json` envelope's `cli_version`. The store's `schema_version` refusal path is the only version machinery that exists, and it versions store *state*, a deliberately independent axis.

Staleness costs more here than it would for an ordinary CLI, because the installed binary is also the source of the store's generated content. The shipped `ctxr-*` skills are rendered from templates the binary carries, and `ctxr update` re-renders them, the fenced `AGENTS.md` sections, the git hooks, and every adapter's outputs to whatever version is installed. An operator on a stale CLI is therefore running stale *skills* against a stale entry document, and nothing in the system says so. The one moment they reliably reach for `ctxr update` is right after upgrading — which they have no reason to do if they never learn an upgrade exists.

## What Changes

- **The CLI reports its own version.** A new `ctxr version` command emits the installed version through the standard envelope on stdout, and a `--version`/`-V` flag reaches the same result. `ctxr version` also reports where the running executable resolves from and whether that location is a global install or a linked working copy, so a caller can tell whether `npm install -g` is even the right instruction.
- **`ctxr version --check` resolves the latest published release** from the npm registry and compares it against the installed version, exiting `0` when current, the check-failed code when a newer release exists, and the usage code when the answer could not be determined — never guessing.
- **`ctxr session start` and `ctxr update` carry an advisory.** Both consult the registry and, when a newer release exists, emit a human notice on stderr and an `info`-severity finding in the envelope. The advisory never changes either command's exit code and never fails either command: a timeout, an unreachable registry, a malformed response, or an unusable cache all degrade to a separate `info` finding recording that the check could not be completed. `ctxr session start` is the trigger that matters, because it is where an agent-driven session begins; it already fetches from the network (`git fetch origin`), so it gains no new connectivity dependency.
- **A new contexture-owned skill, `ctxr-upgrade`,** carries the upgrade procedure: read the live answer from `ctxr version --check`, stop when the install is a linked working copy rather than a global install, ask the operator before doing anything, upgrade through the package manager, confirm the new binary is on the path, and only then run `ctxr update` so the store's generated files are re-rendered by the *new* version. The session-lifecycle skill's start step offers it when the advisory fires, and never blocks the session on the answer.
- **The CLI asks nobody.** The prompt is the agent's, not the CLI's: on the path this feature exists to serve, `ctxr` is a spawned subprocess with no TTY and — under `--json` — no input at all, so a prompt from inside the command would be skipped on essentially every invocation. Consulting the operator is judgment, which the code/judgment seam places in skill markdown.
- **Network access enters `src/` for the first time,** behind a single injected port on the run environment, alongside the existing git and prompter ports. Only the real environment constructs the real client; every test supplies a fake, so no HTTP interception is introduced anywhere.
- **A new `update_check` configuration block** turns the advisory off and sets its cache lifetime, with shipped defaults, plus an environment variable that suppresses the check for one invocation. Because the block is new and carries shipped defaults, it needs no schema-version bump and no migration.
- **BREAKING**: N/A. No existing command changes its exit code, its stdout, its data shape, or its offline behavior. `ctxr doctor` and `ctxr init` stay offline; every existing envelope field keeps its meaning.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `cli-contract`: adds a requirement that the CLI reports its own version and install location through the standard envelope on stdout, and a requirement that a newer published release is surfaced where a human or an agent can act on it — naming the commands that consult the registry, the commands that must stay offline, the rule that the advisory never changes an exit code and never fails its command, the undeterminable case, and the configuration that disables it.
- `harness-portability`: adds a requirement that `ctxr-upgrade` ships as a contexture-owned skill delivered by init and update, that it refuses to instruct a global install when the running executable is a linked working copy, that it gates the upgrade behind operator approval, that it orders the package upgrade before the store re-render, and that the lifecycle skill's start step offers it without blocking the session.

## Non-goals

- **An ambient check on every command.** Rejected on two grounds. It taxes the hot inner loop — a single session runs `ctxr graph query`, `ctxr lint`, and `ctxr catalog show` dozens of times, and none of them should wait on a registry. And a notice on every invocation lands in agent transcripts and hook output, which is where a nag stops being read. Once per session, at the command that opens the session, reaches the same operator without either cost.
- **A staleness check in `ctxr doctor`.** `doctor` runs inside the installed pre-commit hook, so a registry call there puts every commit behind the network and would let an outage look like a failed check. The archived `keep-external-dependencies-current` change already established that doctor stays offline; this change keeps that.
- **A check in `ctxr init`.** `init` guarantees offline, deterministic behavior, and it is the one command that runs before a store exists — so it has nowhere to cache and nothing to advise about yet.
- **A `ctxr upgrade` command that runs the package manager itself.** The upgrade needs operator consent, which the CLI cannot obtain on the path that matters, and a process that replaces its own running binary mid-invocation is a failure mode worth not owning. `ctxr update` also already means "re-render this store's contexture-owned files," and overloading that verb would make the more common operation ambiguous.
- **Prompting from inside the CLI.** `--json` implies no-input and a spawned subprocess has no TTY, so the prompt would never fire where it is needed; the skill asks instead.
- **Auto-upgrading, or blocking a session on a declined upgrade.** The advisory is advice. A session proceeds identically whether the operator upgrades, defers, or declines, and declining is not recorded as a problem with the store.
- **Honoring a custom npm registry, a private mirror, or a proxy configuration.** The check queries the public registry directly rather than shelling out to the package manager to resolve configuration. An operator behind a mirror gets an honest "could not determine" instead of a wrong answer, and the advisory costs them nothing because it never fails a command.
- **A semantic-versioning dependency.** Every published version is a plain three-part release with no prereleases or build metadata. A comparison that handles exactly that shape and refuses to compare anything else is smaller than a dependency and fails in the right direction — an unrecognized version is reported as undeterminable, never as a guess.
- **Notifying about anything other than the CLI's own release.** Vendored third-party skill drift is already observed at the repository level by the weekly vendored-skill watchdog, and refreshing that payload is a contexture release rather than a store-side action.

## Impact

- **New source files**: a registry client (the only outbound network call in `src/`), a version-check module holding the comparison, the cache, and the shared advisory helper, and the `version` command.
- **Changed source files**: the run environment gains the registry port and constructs it in the real environment only; the command registration file gains the `version` command and the `--version` flag; `session start` and `update` call the advisory helper; the configuration schema and shipped defaults gain the `update_check` block; the shipped-skill registry gains a seed for `ctxr-upgrade`.
- **New templates**: the `ctxr-upgrade` skill body. **Changed templates**: the session-lifecycle skill's start step.
- **Dependencies**: none added. The registry client uses the platform `fetch` and abort-timeout primitives already available at the declared minimum Node version.
- **Store state**: one new cache file under the store's existing derived-cache directory, which is already covered by the managed gitignore fence and the configured derived paths, so it needs no new plumbing and never rides review. No new state is written outside a store root.
- **Configuration**: one new block with shipped defaults. No schema-version bump, no migration — an omitted block resolves through the defaults, and only an overridden value would ever need one.
- **Existing stores**: pick up the new skill and the revised lifecycle skill on their next `ctxr update`, through the same shipped-skill sync that delivers every other owned skill. The harness bridge surfaces the new skill as a slash command with no additional wiring.
- **Offline behavior**: unchanged for every command except the three named above. A machine with no network keeps working; the advisory degrades to an `info` finding.
