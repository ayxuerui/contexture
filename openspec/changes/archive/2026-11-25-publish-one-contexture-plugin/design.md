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

The plugin is contexture's: the skills are contexture's text, and only the values differ between stores. It is generated into `plugins/ctxr/` in contexture's public repository and listed by `.claude-plugin/marketplace.json` at the repository root, with source `./plugins/ctxr`. A member's connector to their store is added separately, once.

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
3. **ChatGPT:** the store's ChatGPT plugin zip, built in memory as before with the store's connector, now carrying the store-independent skills. A general ChatGPT plugin is deferred: on personal plans ChatGPT has no marketplace, so it would not update itself either.

Its text lives in `templates/plugin/page.html`.

**Rejected alternative: drop the page.** The connector address and the steps would then live only in the README, and a non-engineer member needs them in one place they already sign in to.

### D5. The plugin is `contexture`, with typed commands for its entry points

The plugin and the marketplace are both named `contexture` (revision 11). It carries seven commands, each mapped explicitly to the skill it opens:

| Command | Skill |
|---|---|
| `/contexture:capture` | `ctxr-capture` |
| `/contexture:ingest` | `ctxr-ingest-orchestration` |
| `/contexture:research` | `ctxr-research` |
| `/contexture:rollup` | `ctxr-rollup` |
| `/contexture:mission` | `ctxr-mission` |
| `/contexture:session` | `ctxr-session-lifecycle` |
| `/contexture:submit` | `ctxr-submit` |

**How a command is built:**
- **Body:** the full MCP render of its skill, generated from the same template, followed by the person's `$ARGUMENTS`. In chat a command loads as a skill, so whichever of the two Claude loads, it has the whole procedure.
- **Description:** worded as a typed shortcut ("Typed shortcut: …"), so a natural request matches the skill's description and not the command's.
- **Frontmatter:** `description` only. claude.ai documents only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`, so `disable-model-invocation` (Claude Code only) is left out (revision 7). The typed-shortcut description and the full body are the protection on every surface.
- **Check:** a test fails when a command maps to a skill the plugin does not carry, or when its body differs from that skill's render.

**Why `contexture` (revision 11):** plugins are conventionally named for the product.
- **A survey of about 30 plugins** (2026-11-01, read from their manifests on GitHub) found `figma`, `supabase`, `vercel`, `stripe`, `sentry`, `atlassian`, `canva`, `box`, `airtable`, `linear`, `asana`, `circleback`, and Anthropic's `productivity`, `sales` and `code-review`.
- **Where a product's CLI is shorter than its brand, the brand still wins:** GitHub (CLI `gh`) ships `github`, and Sentry (CLI `sentry-cli`) ships `sentry`.
- **Commands are bare verbs under that name,** as in `/vercel:deploy` and `/stripe:test-cards`.
- **Skills that also live outside the plugin keep a prefix,** as in `/figma:figma-use` and `/sentry:sentry-debug-issue`. That is the same as our `ctxr-*`.

An earlier three-model poll had preferred `ctxr` for its shorter, CLI-matching commands. It compared the names in the abstract, without this evidence. For members who know the product as contexture, following the ecosystem's convention outweighs the shorter prefix.

**Commands for the local-only skills** (land, publish, upgrade, second-opinion) are not part of this change. Stores get no `.claude/commands/` copies: see D6.

### D6. In a checkout, the plugin defers to the store's own skills

A plugin added on claude.ai syncs into the same person's Claude Code. There its chat render ("you are working through this store's server") would sit beside the store's own `ctxr-*` skills, which are written for a checkout.

**The rule:** the preamble's first section says that when a `contexture.yaml` sits at the root of the working directory and a shell runs `ctxr`, this is a checkout. The plugin's skills and commands are the `contexture:`-namespaced ones. In a checkout the agent invokes the un-namespaced `ctxr-<name>` skill from the store's skills folder, and never the `contexture:` one. A `/ctxr:` command then works on both surfaces: through the connector in chat, and through the store's skill in a checkout.

**No `.claude/commands/` copies in stores.** For an operator who also has the plugin, they would duplicate every `/contexture:` entry in Claude Code.

**Accepted gap:** an operator without the plugin gets no `/contexture:` commands locally, and asks in words as today.

### D7. One skill text for both surfaces (supersedes D6 and the separate MCP render)

Until now, each shared skill had two renders from one template: a store copy written for a shell, and a plugin copy behind a preamble that translated every `ctxr`, `git` and `gh` step into a tool. That made it two instruction texts. The translation cost the model a step at every instruction, and a step the table missed failed silently.

**The research** (2026-11-02, read from the vendors' skill files) found no pattern where a capability phrased alone ("check the store with lint") works on both surfaces. Every vendor that ships both a CLI and MCP does one of three things:
- names both forms at the step, as Supabase does ("use `execute_sql` (MCP) or `supabase db query` (CLI)") and Vercel does ("MCP-first, CLI-fallback");
- ships separate per-surface skills with a router that probes which surface is present, as Box does;
- makes the CLI mirror the MCP tools one for one, as Airtable does.

contexture already has the third. Its MCP surface mirrors the CLI: the `ctxr` runner takes the CLI's own arguments, and `session_<verb>` is `ctxr session <verb>` (`2026-11-01-serve-the-session-lifecycle-to-chat-apps` D9). So the translation reduces to rules that apply to every step, plus the two-name form for the one remaining shell-only step.

**The design:**
- **One shared opening section, in both the store copies and the plugin copies, replacing the preamble and the checkout rule:**
  - **The probe:** if `session_start` and a `ctxr` tool are in your tool list, you are working through the store's server. Otherwise run `ctxr` in a shell.
  - **Command steps:** through the server, a `ctxr session <verb>` step is the tool `session_<verb>`, and every other `ctxr …` step is the `ctxr` tool, or `ctxr_write` when it writes, with the words after `ctxr` as `args`.
  - **Paths:** through the server, paths go under the session's root.
  - **Commits:** through the server, commits and pushes happen only in `session_submit`.
  - **Unavailable steps:** a step the mapping marks unavailable is skipped.
  - **Store values:** the plugin's `<…>` values are given under *This store*.
  - **Older servers:** the rule for a server older than the skills.
- **The three remaining git steps are reworded:**
  - **The canonical-clone refresh in `ctxr-session-lifecycle`** (`git fetch` plus `git merge --ff-only`) becomes `ctxr sync` (#225). That is the same fast-forward rule, leaving a clone with local work alone. Through the server it is marked unavailable, because the server keeps its own clone current.
  - **`git mv` in `ctxr-placement`** names both forms at the step: "`git mv` in a shell, or the `Move` tool through the store's server".
- **The drift check changes to match:** every `git` or `gh` step in a shared skill names its server-side tool in the same sentence. The mapping module (`tool-map.ts`) stays the single source for routes and for unavailable commands.
- **The checkout rule (D6) is removed.** The plugin's text is correct in a checkout too, so a synced plugin in Claude Code and the store's own copy say the same thing.

**What it costs:** every agent, local or remote, reads the opening section (about 15 lines). And each store's copies change once, through the `ctxr update` re-render PR.

**Opposing case (keep two renders), steelmanned:**
- Each agent reads only the text for its own surface: less to read, no branch to choose wrong.
- One template already prevents drift.

**Why it loses:**
- **The shared section is short and fixed.** It replaces a per-step translation that cost a step at every instruction and failed silently on any row it lacked.
- **A plugin skill can end up in front of a local agent.** A claude.ai plugin syncs into Claude Code, where two different texts with the same name would compete. That is the problem the checkout rule existed to patch.

**Rejected alternative: serve the MCP skills from the server** (MCP SEP-2640, `skill://` resources). It is attractive because text and tools would version together, but no client support could be confirmed.

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

(Revisions 7–10 were written while the plugin was named `ctxr`; revision 11 renamed it back to `contexture`. Read `ctxr:`, `/ctxr:`, `plugins/ctxr/` and `ctxr-claude.zip` there as `contexture:`, `/contexture:`, `plugins/contexture/` and `contexture-claude.zip`.)

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
6. **Where `ctxr plugin build` writes** (settled in implementation). Each plugin is a directory and a zip beside it under `--out`: the Claude plugin at `<out>/contexture/` with `contexture-claude.zip`, and in a store with `mcp` its ChatGPT plugin at `<out>/chatgpt/` with `contexture-<store>-chatgpt.zip`. The default `--out` is `.contexture/cache/plugin/` inside a store, as before, and `./contexture-plugin/` outside one, so a build never writes into the working directory itself. `npm run plugin` is `ctxr plugin build --out plugins` with the store root cleared, which lands the plugin at `plugins/ctxr/`; the zip beside it is removed and ignored. A store without `mcp` gets the Claude plugin and a notice, not the old configuration error, since the Claude plugin needs no server.

### Second round (D5, D6)

A three-model critique of D5 and D6 approved them with changes from all three reviewers.

7. **`disable-model-invocation` is dropped from the commands, and the claude.ai upload becomes a gate.** Two reviewers raised it: the key is outside claude.ai's documented frontmatter, and refusal would only surface after a release. Before the release PR merges, the operator uploads the `ctxr-claude.zip` that `ctxr plugin build` writes to their claude.ai account. They confirm it installs, that `/ctxr:capture` is offered, and that a natural request loads `ctxr-capture` (task 7.5).
8. **The checkout rule names the distinction:** the `ctxr:`-namespaced entries are the plugin's, and the un-namespaced `ctxr-<name>` is the store's. The test asserts that wording, not only its position.
9. **Build-side names:** the Claude plugin builds to `<out>/ctxr/` and `ctxr-claude.zip`, with a matching ignore rule. The per-store ChatGPT plugin keeps `contexture-<store>` and `contexture-<store>-chatgpt.zip`, because it is that store's plugin, connector included.
10. **Declined: emitting the entry-point skills under short names (`capture`, `submit`) instead of commands.** This is the plugin-only rename that the earlier poll ranked below keeping the prefix. A skill would have one name in chat and another in the stores, and the plugin render would have to rewrite every cross-reference. The commands' duplicated bodies are generated from the same template and checked, so they cannot drift. The cost accepted is a longer `/` menu.

### Third round (naming)

11. **The plugin is `contexture`, not `ctxr`,** after a survey of popular plugins showed that plugins are named for the product, even where its CLI is shorter (GitHub's `gh`, `sentry-cli`); see D5. Commands read `/contexture:capture` and the like. Skills keep `ctxr-*`. The build writes `<out>/contexture/` and `contexture-claude.zip`, and the repository commits `plugins/contexture/`.
12. **The license is MIT.** `package.json`, the README and every published release already said MIT, while `LICENSE` held the Apache 2.0 text from the initial commit. The file now carries the MIT text, so the plugin's manifest and the `LICENSE` file it copies agree.

### Fourth round (one text)

13. **D7 replaces the separate MCP render and the checkout rule (D6)** with one shared text, after research on how vendors write skills for both a CLI and MCP. The requirement *Owned skills render for the MCP surface from the same source* is replaced by *The shared skills are one text on both surfaces*. The drift check now asks for the server-side tool to be named beside each `git` or `gh` step.

14. **The shared opening section is ordered by intent, then place, then tools.** Two reviewers raised the first point, and all three the inventory.
    - **First, which store.** The store the person means; with several connectors, the connector for that store, and ask when it is unclear.
    - **Then where.** A checkout of that store (a `contexture.yaml` at the root and a shell that runs `ctxr`) means the shell, even when its connector is also attached. Otherwise, that store's connector.
    - **The rules today's preamble carries are all kept:**
      - `session` names the session for a command or a runner, and `ctxr_write` always needs one;
      - options become fields, and a prepared file's text goes as `input`, with `@input` in `args`;
      - several connectors;
      - sessions across conversations;
      - steps not done through the server (landing, upgrading, working inside a mount);
      - the older-server rule;
      - *This store*.
15. **Unavailable steps are marked at the step, not by a general rule.** The two cases are `ctxr sync` and `ctxr shared-stores sync` in the lifecycle skill, which read like "in a shell, run `ctxr sync`; through the store's server, skip this step, since the server keeps its own clone current". The mapping module still lists them as unavailable, so the drift check can require that marking wherever they appear.
16. **The drift check is a prohibition.** A shared skill names no `git` or `gh` step unless the same sentence names the server-side tool. That leaves only `git mv` with `Move`.
