# Proposal

## Why

contexture's marketplace lists two plugins, `contexture` and `second-opinion`. The second name does not say whose plugin it is, and a plugin with the same name from another marketplace would collide with it. Beside `contexture`, it also does not read as part of the same product.

## What Changes

- **BREAKING: the plugin `second-opinion` is renamed `contexture-second-opinion`.** That is its name in the marketplace, its folder (`plugins/contexture-second-opinion/`), its archive (`contexture-second-opinion-claude.zip`) and its typed command, which becomes `/contexture-second-opinion:ask`.
- **The ChatGPT plugin a server builds for a second-opinion member is renamed to match:** `contexture-second-opinion-<server>` in place of `second-opinion-<server>`, with its archive.
- **The connect pages, both READMEs and the marketplace entry use the new name.**

## Non-goals

- **Renaming the skill.** It stays `ctxr-second-opinion`, the name of the command group it drives.
- **Renaming the scope, the tools or the command.** `second-opinion`, `second_opinion_*` and `ctxr second-opinion` are unchanged.
- **An alias for the old plugin name.** A marketplace lists a plugin under one name. Someone who installed `second-opinion` installs `contexture-second-opinion` and removes the old one.
- **Changing what either plugin carries.** The `contexture` plugin still carries the second-opinion skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: the two requirements that name the second-opinion plugin and its folder use the new name.
- `remote-access`: the two connect-page requirements name the plugin by its new name.

## Impact

- **Code:** the plugin's definition in `src/core/plugin/commands.ts` (its name and its ChatGPT name), and comments that name it.
- **Repository:** `plugins/second-opinion/` moves to `plugins/contexture-second-opinion/`; `.claude-plugin/marketplace.json`; the `plugin` script in `package.json`.
- **Docs:** `README.md`.
- **Members:** anyone who installed `second-opinion` from the marketplace installs the new name. A ChatGPT archive downloaded earlier keeps working; a new download has the new name.
- **Sync order:** this change modifies requirements that `offer-the-second-opinion-on-its-own` adds. It syncs after that change.
