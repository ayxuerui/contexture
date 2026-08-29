## Why

`contexture` is ten characters in front of every subcommand, and the unscoped npm name `contexture` is already held by an unrelated, actively maintained package — so the project cannot ship under its own name regardless. The moment before the first publish is the only cheap time to choose the distribution name; afterwards every install instruction, generated document, and hook in the wild carries it.

## What Changes

- **The executable and the npm package become `ctxr`** — one string for `npm i -g ctxr`, `npx ctxr`, and the shell prompt. `ctxr` is unclaimed on npm and Homebrew, is not a common shell alias (unlike `ctx`), and still reads as "context". `contexture` stays available as a compatibility alias executable pointing at the same entry point.
- **Every shipped instruction to run a command names `ctxr`**: the generated sections of `AGENTS.md`, the shipped procedure seeds, generated harness skill wrappers, the installed git hooks (their comments, their `re-run …` hints, and their message prefix), command error and check messages, and the CLI's own usage output.
- **The project name stays `contexture` for everything that lives in a store or the operator's environment**: the configuration file, the tool-owned home directory, `CONTEXTURE_*` environment variables, generated-region markers, generated skill directory names, commit messages, and prose that refers to the tool as a product. The split is the ripgrep/`rg` one: `ctxr` is what you type, Contexture is what it is.
- The project context in `openspec/config.yaml` records the split so future specs do not drift between the two names.
- **BREAKING**: N/A. Existing stores need no migration — nothing store-resident changes name. Their generated regions and hooks are rewritten to name `ctxr` the next time `init` reconciles them / `doctor` self-heals them. Operators who invoke `contexture` from a global install keep working via the alias.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `cli-contract`: binds the executable and package name (`ctxr`) in exactly one place, requires every shipped instruction to run a command to use it, and states that store-resident names are unaffected by the rename.

## Impact

Affected code: `package.json` (`name`, `bin`), `src/run.ts` (program name), `src/core/agents-doc.ts`, `src/core/procedures.ts`, `src/adapters/harness/claude-code.ts`, `src/core/errors.ts`, `src/core/checks/*.ts` (invocation strings), `templates/hooks/*.sh`, `README.md`, tests that assert on invocation text, `openspec/config.yaml` (project context).

## Non-goals

- **Renaming store-resident names** (`contexture.yaml`, `.contexture/`, `contexture:<region>` markers, `.claude/skills/contexture-<name>/`, `CONTEXTURE_*` env vars). Each would force a migration on every existing store for no gain at the command line, and the project context deliberately defers the store's root-noun decision — this change must not pre-empt it.
- **Renaming the product, repository, or the identifiers in existing specs.** Existing specs write `contexture <command>`; the cli-contract delta binds that notation to the executable once rather than rewriting ~60 scenario lines across four changes' delta specs.
- **Publishing.** This change makes the package publishable as `ctxr`; the `npm publish` (and any Homebrew formula) is an operator action. The name is free but unheld — reserving it with a placeholder release is the operator's next step.
