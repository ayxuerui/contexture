## Context

`ctxr plugin build` (`src/core/plugin/build.ts`) renders the MCP target of the owned skills against one store's configuration. It writes a Claude plugin whose `.mcp.json` names that store's `serve.base_url` `/mcp`. `serve` builds the same plugin in memory for `/plugin/`.

Claude's own documentation, read on 2026-11-01, gives the update rules:
- **Uploaded zips** never update.
- **A marketplace a person adds themselves** (Customize › Plugins › Add marketplace) updates automatically once **Sync automatically** is on. A private GitHub repository needs that person's GitHub account to have access.
- **A user gets a new copy only when the plugin's computed version changes.** That is `plugin.json`'s `version`, then the marketplace entry's.
- **Organisation sync** of a private repository needs a Team or Enterprise plan. The operator's plan is personal.
- **A `.mcp.json` URL containing `${user_config.*}` is ignored in chat**, so one plugin cannot carry a per-person connector address.

The store-specific values in today's render come from 13 placeholders across the included skills:
- `__DEFAULT_BRANCH__`, `__INBOX_PATH__`, `__CAPTURE_ROOT__`, `__TEMPLATES_PATH__`, `__LOG_PATH__`, `__GRAPH_DOCUMENT_PATH__`, `__MISSION_MAX_BYTES__`, `__HOUSE_CONVENTIONS_PATH__`, `__ARCHIVE_DESTINATION__`, `__SCRATCH_PATH__`;
- three computed blocks: `__CLUSTER_DEPTH__`, `__LAYER_STEP__` (from the taxonomy) and `__RELATION_GROUPING_STEP__` (from the relation vocabulary).

pkm's AGENTS.md already states the inbox, templates, layers, relation vocabulary, guidance, archive and default branch. It does not state the capture root, log, graph document, cluster depth, mission size or scratch path.

## Goals / Non-Goals

**Goals:**
- One plugin that every store's members install once and that updates itself.
- It updates at a release. Each store's server updates on its own schedule (here, daily), so the skills tolerate a server that is behind (revision 1).

**Non-Goals:**
- No change to the CLI render or to any tool.

## Decisions

### D1. One plugin, from contexture's repository, with no connector

The plugin is contexture's: the skills are contexture's text, and only the values differ between stores. It is generated into `plugins/contexture/` in contexture's public repository and listed by `.claude-plugin/marketplace.json` at the repository root, with source `./plugins/contexture`. A member's connector to their store is added separately, once.

**Opposing case (keep the per-store plugin), steelmanned:**
- **One install instead of two.** The plugin brings its connector.
- **No lookup.** The skills state the store's exact paths and layers.
- **No ambiguity.** A member in two stores gets two plugins, each bound to its own connector, so the tools are never mixed up.

**Why it loses:**
- **It cannot update on the operator's plan.** Every member would re-upload a zip at every release. Making it update needs a marketplace that each member can read. For a store's own plugin that is either a private repository (each member a GitHub user with access to every note) or a public one publishing the store's configuration.
- **The cost of the general plugin is small.** One extra install, done once, and one lookup in a document the agent already has, the connector's instructions (D2).

**Two alternatives were also rejected:**
- **A separate public repository holding only pkm's plugin.** It would need a job holding a write credential to publish it, and it still means one plugin per store.
- **A directory listing.** It also updates automatically, but adds review and is not needed for updates. Left as a follow-up.

### D2. Store values come from the connector's instructions

The MCP render replaces each placeholder with a named token in angle brackets, for example `<inbox path>`, `<log path>` or `<default branch>`. The computed blocks get generic text: "the layers listed under *This store* in the connector's instructions" and "group links by the relation vocabulary listed there".

The preamble states the rule once: every `<…>` value in a skill is given in the connector's instructions under *This store*.

`templates/mcp/server-instructions.md` gains that section, rendered by `serve` from the loaded configuration:
- every token's value;
- the taxonomy's layers with their descriptions;
- the relation vocabulary;
- the server's ctxr version.

**Opposing case (read them from AGENTS.md):**
- **It's the canonical entry document** for every harness, and the skills already say to read it before writing.
- **It needs no new server text.**

**Why it loses:**
- **AGENTS.md lacks six of the values,** and adding them would spend part of the size budget that agy's 24 KB limit binds.
- **AGENTS.md costs a `Read` call per conversation.** The connector's instructions arrive with `initialize` at no cost.

The skills still read AGENTS.md for conventions, as they do today.

**Two risks, recorded below:** a client that drops server instructions, and two contexture connectors attached at once.

### D3. The version is the CLI's, and the committed plugin is checked

`plugins/contexture/.claude-plugin/plugin.json` carries `version` equal to `package.json`'s. `npm run plugin` regenerates the directory from the built CLI.

A test renders the plugin and compares it byte for byte with the committed directory, and checks that the version matches. Both have to pass on every PR:
- **A PR that changes a skill regenerates the plugin** in the same PR.
- **The release PR's version bump regenerates it** with the new version.

Members receive a new copy only when the version changes, so only at a release.

**Accepted gap:** between releases, someone installing for the first time gets main's newer skill text under the previous version number. Those skills could name a tool that no released server has yet. The window is one release cycle. D2's version line lets the agent tell the person that their store's server is older.

**Alternatives considered:**
- **Point the marketplace entry at a release tag (`ref`).** Every release would need a commit to `marketplace.json` naming the new tag. That is the same commit the version bump already is, with an extra moving part.
- **Omit `version`.** Users would then track every commit to main, and with it every unreleased tool.

### D4. `/plugin/` becomes the connect page

The page, still behind the verified identity, gives:
1. **Claude:** add the marketplace `ayxuerui/contexture`, turn on Sync automatically, and install `contexture`.
2. **This store's connector:** its address, `serve.base_url` `/mcp`, and how to add a custom connector in each app.
3. **ChatGPT:** the general ChatGPT plugin zip, built in memory as before but without a connector, plus the same connector steps.

Its text lives in `templates/plugin/page.html`.

**Rejected alternative: drop the page.** The connector address and the steps would then live only in the README, and a non-engineer member needs them in one place they already sign in to.

## Risks / Trade-offs

- **A client that does not pass server instructions to the model** never sees *This store*. → The preamble also says that a missing value can be read from AGENTS.md, which states most of them, and that otherwise the agent asks. Claude passes server instructions; ChatGPT is checked in task 6.2.
- **Two contexture connectors attached at once** (pkm and family-brain). Each one's instructions name its own store, so tool calls must go to the right connector. → The preamble says to use the connector for the store the person names, and to ask when it is unclear. `session_list` and every result name the store's head commit.
- **A member keeps the old per-store `contexture-pkm` plugin installed alongside `contexture`.** → The connect page and the README say to remove it. The two have different names, so nothing silently replaces the other.
- **The committed plugin goes stale** if a skill change lands without regenerating it. → The freshness test fails the PR. That is the same mechanism the store's managed skills rely on.

## Migration Plan

1. **Ship in a release.** The marketplace goes live when the PR merges. The plugin's version then equals the release.
2. **Members switch once:**
   - remove `contexture-pkm`;
   - add the marketplace and install `contexture`;
   - keep the connector already added for pkm.
3. **Rollback:** delete the marketplace entry. The operator runs `ctxr plugin build` for the connector-less zip, and members upload it and keep their store connector (revision 4).

## Revisions after critique

A three-model critique on 2026-11-01 approved this change with changes from all three reviewers. These revisions override anything inconsistent above.

1. **The plugin can be ahead of a store's server, and the skills say what to do then.** Two reviewers raised this independently.
   - Members get a new plugin when the release PR merges. Each store's `serve` updates on its own schedule: daily on this host, possibly later for other operators. The goal "never before the servers have the tools" was false and is withdrawn.
   - Instead, the preamble states a rule. When a step names a tool or command the connector does not offer, say that this store's server runs an older ctxr (the version under *This store*), skip that step or use the nearest one it does offer, and never improvise a replacement for a write.
   - The connector's tool list is what the agent checks against. There is no minimum-version table to keep in step.
   - Task 6.2 tests the updated plugin against a server one release behind, and with two stores connected at once.
2. **The committed plugin is the Claude plugin directory only.** Its README and license are rendered by `ctxr plugin build` from `templates/plugin/`, so they are generated too. The archives are not committed and are not part of the freshness comparison.
3. **The MCP render takes no configuration.** It substitutes one static placeholder map. The "two stores render one plugin" scenario becomes an assertion that the render contains no value from the shipped defaults.
4. **Rollback is described as shipped.** The operator runs `ctxr plugin build`, which writes the connector-less zip, and members upload it and keep their store connector.
5. **Declined: removing the `ctxr plugin build` command** (pragmatist). It is the rollback path above, it is what `npm run plugin` calls, and it lets an operator build the plugin without `serve`. It costs one command, and dropping it would leave no way to produce the zip outside the repository's npm scripts.
