# Proposal

## Why

A second opinion's models are a table in the code, changed only by `CTXR_SECOND_OPINION_*` environment variables. A store whose model-CLI account is not offered a default model has to keep an override outside the store. On a store's server that means a variable in an untracked `.env` and a container recreate, which nobody reviews and no member can see. Seen 2026-11-13: an account that `agy` does not offer the `strong` tier's model to reports `agy` down on every default run, in a shell and on the server.

`2026-10-05-ship-a-cross-model-second-opinion-skill` D6 chose the environment on purpose. Its flip condition was "a store that needs a persistently different lineup, not just a newer model name". That is this case. Its objection that no `ctxr` command would read the key ended when `ctxr second-opinion` became a command.

## What Changes

- **The lineup becomes store configuration with shipped defaults.**
  - A new `second_opinion` block in `contexture.yaml` names, for each tier (`strong`, `fast`) and each model CLI (`claude`, `codex`, `agy`), the model, and the effort where that CLI takes one.
  - Every model, and every effort contexture ships today, is a shipped default on the configuration schema. A store's file records only what differs, so a store that names nothing follows a changed default on upgrade.
  - The table in `src/core/second-opinion/lineup.ts` goes away; the schema's defaults are the one copy.
- **`ctxr second-opinion` reads the store when it runs in one.** Outside a store it uses the shipped defaults and still answers from any directory.
- **`agy`'s shipped `strong` model becomes `Gemini 3.8 Flash (High)`,** the model every `agy` account is offered, in place of `Gemini 4 Argon (Medium)`, which `agy` lists only on some plans. A store whose account offers a stronger model names it.
- **The environment variables stay, as a per-run override.** `CTXR_SECOND_OPINION_{CLAUDE,CODEX,AGY}_MODEL` and `CTXR_SECOND_OPINION_{CLAUDE,CODEX}_EFFORT` win over the store's configuration, for both tiers, as today.
- **`preflight` and the manifest say where each model came from:** the environment, the store's configuration, or the shipped default.
- **Through the store's server, the lineup is the served commit's.** The `ctxr` tool runs the command against the served store, not a temp folder with no store. A session's unreviewed configuration does not choose what the server runs.
- **The skill and README are reworded.** "Nothing about the lineup lives in the store's configuration" becomes how to name a model in `contexture.yaml`, and when the environment is still the right tool.
- **Supersedes D6** of `2026-10-05-ship-a-cross-model-second-opinion-skill`.

## Non-goals

- **Removing the environment overrides.** A deeper pass (`CTXR_SECOND_OPINION_CLAUDE_EFFORT=max`) is a choice for one run, and a member on a laptop whose account offers more than the store's can still say so. One mechanism would be simpler, but it would turn a per-run choice into a store edit and a pull request.
- **Choosing models from chat.** A member still picks `--tier`, `--only` and `--lens`. A model name typed into a chat is an argument no reviewer saw.
- **Per-person or per-machine configuration.** contexture has no configuration outside the store, and one audience per store. A file in the home would be a second configuration source to explain and to back up; the environment already covers the one person whose account differs.
- **Changing any other shipped model.** `claude`'s and `codex`'s defaults move as they are.
- **Falling back to another model when one is refused.** A CLI that rejects its model stays a failed critic, named as such. Substituting quietly would hide that the store's lineup is wrong.
- **A schema version bump or a migration.** The block is new and fully defaulted, and the schema passes unknown keys through, so an older `ctxr` reading a store that names a model ignores the block.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: a new requirement that the second opinion's lineup is the store's configuration with shipped defaults, overridable by environment for one run, and reported with its source.
- `remote-access`: a new requirement that a second opinion through the `ctxr` tool uses the served commit's lineup.

## Impact

- **Code:**
  - `src/config/defaults.ts` and `src/config/schema.ts`: the `second_opinion` block and its shipped defaults.
  - `src/core/second-opinion/lineup.ts` and `modes.ts`: the lineup is resolved from the environment, then the store's configuration, then the shipped default, and carries its source.
  - `src/commands/second-opinion.ts` and `src/run.ts`: the command takes an optional store, as `plugin build` does.
  - `src/core/mcp/tools/cli.ts`: the second opinion's child process is given the served store as its root.
- **Templates:** `templates/skills/ctxr-second-opinion.md`; `plugins/contexture/` is regenerated.
- **Docs:** README (the second-opinion section and the configuration reference).
- **Tests:** `test/unit/config-schema.test.ts`, `second-opinion.test.ts`, `mcp-second-opinion.test.ts`, `single-source-literals.test.ts`.
- **Stores:** a store that names no lineup asks `agy` for Flash at the default tier from this release; nothing else changes for it. A store whose account offers a stronger `agy` model adds the lines for it by a normal session pull request.
- **contexture-images:** nothing. Its #102 passes the environment overrides to `serve`; that stays valid and is no longer the only route.
