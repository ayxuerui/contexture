# Tasks

## 1. Rename

- [x] 1.1 In `src/core/plugin/commands.ts`, name the definition `contexture-second-opinion` and its ChatGPT plugin `contexture-second-opinion-<slug>`.
- [x] 1.2 Move `plugins/second-opinion/` to `plugins/contexture-second-opinion/`, and update `.claude-plugin/marketplace.json` and the `plugin` script in `package.json`.
- [x] 1.3 Update `README.md` and the comments that name the plugin.

## 2. Verify

- [x] 2.1 Update the plugin, connect-page and marketplace tests to the new name; run `npm run plugin` and commit the regenerated plugins.
- [x] 2.2 Run `npm test && npm run typecheck` and confirm both exit 0.
- [x] 2.3 Run `openspec validate rename-the-second-opinion-plugin --strict` and confirm it exits 0.
