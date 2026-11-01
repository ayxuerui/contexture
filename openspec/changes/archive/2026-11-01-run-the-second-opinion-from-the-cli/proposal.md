## Why

Today the cross-model second opinion is a script beside a skill, `node <skills_path>/ctxr-second-opinion/run.mjs`. Change `2026-10-05-ship-a-cross-model-second-opinion-skill` D1 chose that on purpose. It argued that the runner serves only the skill's synthesis and has meaning to no other caller.

That stopped being true once a second caller appeared: the MCP surface needs a second opinion for members working in chat apps, and it cannot reach a skill's supporting file. The runner is code contexture releases either way. As a command, it gets the CLI's type checker, its test suite, its exit-code contract and the affordance check, and it gets one entry point that every caller can use.

## What Changes

- **New `ctxr second-opinion` command group:**
  - `ctxr second-opinion preflight`, `ctxr second-opinion critique` and `ctxr second-opinion poll` replace `run.mjs --preflight`, `--mode critique` and `--mode poll`.
  - They keep the runner's behaviour and its options (`--tier`, `--only`, `--timeout`, `--lens`, `--out`, `--plan-file`, `--prompt-file`, `--seed`), and add `--json` for the manifest.
  - Their exit codes are registered in the CLI's exit-code table, including the distinct partial-result status.
- **The runner and its prompts move into the package.**
  - The runner becomes TypeScript under `src/core/second-opinion/`.
  - The critic contract, personas and lenses move to `templates/second-opinion/`, so they remain reviewable markdown.
- **BREAKING (managed files only).** The skill drops its supporting files. `ctxr update` removes `run.mjs`, `critic-contract.md`, `lenses.md` and `personas/` from stores, as it removes any managed file a release no longer ships. The skill's text names the command instead of `node …/run.mjs`.
- **The command is the one exception to "no `ctxr` command invokes a model CLI"**, recorded in the project context and in harness-portability. No other command depends on it, it is not on the write path, and `verify`, `doctor` and `update` still never name the model CLIs.
- **Containment is tightened, because the command may now run on a server.** The model CLIs get an allowlisted environment (`PATH`, `HOME`, locale, the model CLIs' own variables, `CTXR_SECOND_OPINION_*`), never the whole process environment. This means no forge token, App key path or other secret reaches a model CLI.

## Non-goals

- **Putting the lineup in `contexture.yaml`.** Model names change faster than stores, and the environment overrides stay the one place to change them. This is the same reasoning as the earlier change.
- **Exposing it over MCP.** That belongs to `serve-the-session-lifecycle-to-chat-apps`, which needs this command, plus a place to run it that holds no approval credential.
- **Keeping `run.mjs` alongside the command.** Two runners would drift. A store refreshed by `ctxr update` gets the new skill text and the command together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: the second-opinion requirement changes. The runner becomes a command, and the "no command invokes a model CLI" clause becomes "only this command does".
- `cli-contract`: the new command group and its exit codes.

## Impact

- **Code:**
  - New `src/commands/second-opinion-*.ts` and `src/core/second-opinion/`.
  - `src/core/skills.ts` drops the supporting files of `ctxr-second-opinion`.
- **Templates:**
  - `templates/skills/ctxr-second-opinion.md` is reworded around the command.
  - `templates/skills/ctxr-second-opinion/` moves to `templates/second-opinion/`.
- **Tests:** the runner's stub-CLI tests move to vitest.
- **Stores:** the change arrives with `ctxr update`. Until a store updates, its skill keeps running its own `run.mjs`, which still works.
- **openspec:** `openspec/config.yaml` context gains the exception sentence.
