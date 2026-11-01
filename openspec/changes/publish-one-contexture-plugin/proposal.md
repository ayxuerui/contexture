## Why

The chat-app plugin from `2026-11-01-serve-the-session-lifecycle-to-chat-apps` is built per store. Its connector address and its skill text are rendered from one store's `contexture.yaml`, and members download it as a zip from that store's `/plugin/` page. That causes three problems:
- **No updates.** An uploaded zip never updates. Every release, every member has to download it and upload it again.
- **No marketplace on personal plans.** Automatic updates need a marketplace, and on personal plans a member adds it from a git repository they can read. For a store's own plugin, that means a private repository that holds the whole store. Members would need a GitHub account with access to every note, far more than their MCP scopes give them.
- **One plugin per store.** A person in several stores (pkm, family-brain) installs several near-identical plugins.

The skills are contexture's, not any one store's. One plugin built from contexture itself and published from contexture's public repository updates automatically on every plan, needs no GitHub account, and serves every store.

## What Changes

- **One plugin for every store.** `contexture` is a Claude plugin committed in contexture's repository (`plugins/contexture/`), listed by the `contexture` marketplace (`.claude-plugin/marketplace.json` at the repository root). A member adds the marketplace (`ayxuerui/contexture`) once, turns on **Sync automatically**, and installs `contexture`. Its `version` is the CLI's version, so members receive a new copy exactly when a release ships and never ahead of the servers.
- **Typed commands for the entry points.** Seven commands are generated from the skills they open: `/contexture:capture`, `/contexture:ingest`, `/contexture:research`, `/contexture:rollup`, `/contexture:mission`, `/contexture:session` and `/contexture:submit`. The skills keep their `ctxr-*` names and stay what Claude loads by itself.
- **The plugin defers to a checkout.** A plugin on a claude.ai account also syncs into the person's Claude Code. Its preamble's first rule is: in a checkout of a store, use that store's own skills, not the plugin's.
- **The plugin carries no connector.** Each member adds their store's connector once, by its `/mcp` address. Someone in two stores adds two connectors. The skills work with whichever contexture connector is attached.
- **A store-independent MCP render.**
  - The skills render identically for every store. Each value a CLI render takes from `contexture.yaml` (inbox and capture paths, templates, log, graph document, cluster depth, layers, relation vocabulary, mission size, guidance, archive and scratch paths, default branch) is written as a named placeholder.
  - The shared preamble says to read those values from the connector's instructions.
  - The CLI render is unchanged.
- **Server instructions carry the store's values.** The instructions `serve` sends at `initialize` gain a "This store" section that gives each placeholder's value, rendered from the loaded configuration, plus the server's ctxr version.
- **`ctxr plugin build` builds the general Claude plugin.** It needs no store and no `mcp` block. Inside a store with an `mcp` block it also writes that store's ChatGPT plugin, as today (with its connector), now carrying the store-independent skills. The repository's copy is checked by a test that fails when the committed plugin differs from the render, or when its version differs from the package's.
- **BREAKING: `/plugin/` becomes the store's connect page.**
  - It still requires the verified identity.
  - It now gives the marketplace and plugin to add in Claude, this store's connector address and how to add it, and the store's ChatGPT plugin zip as before.
  - It no longer serves a store-specific Claude zip.

## Non-goals

- **Listing in Anthropic's directory.** The general plugin is now publishable there, since nothing in it is private. That is a separate step, with its own review requirements (README, license, test cases), and the marketplace already gives automatic updates. Left for a follow-up change.
- **A per-store override of the plugin.** A store that wants different skills uses the CLI's own skills path, as it does locally. The plugin is contexture's text.
- **A general ChatGPT plugin, and ChatGPT updates.** On personal plans ChatGPT has no marketplace (a workspace admin can import one, reading the same `.claude-plugin/marketplace.json`), so its plugin stays the store's zip from `/plugin/`, with the store's connector bundled. The operator chose to do Claude first (2026-11-01).
- **Removing `serve`'s plugin build entirely.** `/plugin/` still builds the ChatGPT zip in memory, because a zip is that app's only install path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- **`harness-portability`:**
  - the MCP render is store-independent;
  - contexture ships one plugin from its repository, replacing the per-store plugin build.
- **`remote-access`:**
  - the server instructions carry the store's values;
  - `/plugin/` becomes the connect page.

## Impact

- **Code:**
  - `src/core/skills.ts`: a generic config for the MCP render, and placeholder tokens.
  - `src/core/plugin/build.ts`: no store input, no connector.
  - `src/core/plugin/routes.ts`: the connect page.
  - `templates/mcp/server-instructions.md`: the "This store" section.
  - `templates/plugin/`.
- **Repository:**
  - new `plugins/contexture/` (generated, committed) and `.claude-plugin/marketplace.json`;
  - an `npm run plugin` script;
  - a freshness test;
  - the release checklist regenerates the plugin with the version bump.
- **Members:** a one-time switch. Remove the uploaded `contexture-pkm` plugin, add the marketplace and install `contexture`, and keep or add the store's connector.
- **Archived change:** the opening real-client task (9.2) of `2026-11-01-serve-the-session-lifecycle-to-chat-apps` moves here.
