## Context

`MCP_SKILL_FILES` (`src/core/skills.ts`) lists the shared skills: one text from one template, read in a store's checkout and in the `contexture` plugin alike, each opening with `templates/skills/_surfaces.md`. The comment above it leaves out "the derived-artifacts, organize-audit and publish procedures, whose steps the surface does not offer". For publish, that is mostly no longer true.

**Already offered through the server:**
- `ctxr` runs `publish gather`, `publish check` and `publish urls` (`CTXR_READ_COMMANDS`).
- `Write` and `Edit` may change files under `publish.path` in a session. `protectedReason` refuses only the configuration, `.git*`, derived paths, worktrees and the skills path.
- The store's serve builds a `/preview/<session dir>/` route for every session worktree under `session.worktrees_path` that holds a page (`buildPreviews` in `src/core/browse/routes.ts`). The MCP server starts its sessions there.
- After `session_submit`, the approval page shows `/preview/pull/<n>/`.

**Not offered.** Adding `PUBLISH` to the list and running `test/unit/skills.test.ts` gives nine drift findings on three commands, `ctxr publish new`, `ctxr publish stamp` and `ctxr serve`, plus one failing assertion in the lifespan-step test. Reading `src/core/mcp/paths.ts` adds a fourth gap:
- `nameablePath` hides `retrieval.exclude_paths`;
- the default published-pages location `.contexture/publish/` lies under the default exclusion `.contexture/`;
- so `Read` and `Glob` cannot see a page, and `Edit` of an existing `index.html` has nothing to read first.

## Goals / Non-Goals

**Goals:**
- A member in a chat app follows `ctxr-publish` end to end, from lifespan to `session_submit`, with the same rules as in a shell: lifespan, gather, filing, lead link, stamp and check.
- No new tool. Each gap closes by adding to a list that already exists.

**Non-Goals:**
- Send copies through the server, a server-side renderer or screenshot tool, and bundling vendored skills beyond the two defaults. See proposal.md *Non-goals*.

## Decisions

### D1. Carry the skill; don't write a chat-only publish skill

`ctxr-publish` joins `MCP_SKILL_FILES` unchanged apart from two step-level sentences (D4).

**The case for keeping it out:**
- The skill's quality bar is "look at the page before you hand it on". A chat agent usually cannot open the preview address: it sits behind the store's access proxy (only `/mcp` is exempt), and claude.ai's fetch cannot pass that proxy. So most chat-made pages reach review unseen by their author.
- claude.ai already has its own Artifacts for one-off pages. Members might put throwaway pages into the store that belonged in a private artifact, adding diffs reviewers must read.
- Step 3, deciding what belongs in front of the page's readers, is the step most likely to go wrong. A chat member may be less familiar with the store's conventions than an operator in a checkout.

**Why carry it anyway:**
- **Unseen pages.** The approval page renders the pull request's preview, so a person sees every page before it lands, whoever wrote it. The skill already requires saying "not checked visually" when the author could not look, so the reviewer knows they are first.
- **Throwaway pages.** A disposable store page is shared with the store's members and governed by approval; a private artifact is neither. When a member wants a group-visible snapshot, that is the right place. Lint's 30-day list and the operator's removal keep `disposable/` from growing.
- **Content judgment.** It is the same step either way. Without the skill a chat member who wants a page hand-writes one through `Write`, with no lifespan decision, no `gather`, no lead link and no stamp. Carrying the skill makes chat pages more disciplined, not less.

**Alternative rejected: a separate, shorter chat render.** The shared-skills rule (*The shared skills are one text on both surfaces*) exists because two texts drift. A step-level sentence costs less than a second skill.

### D2. `publish new` and `publish stamp` join `ctxr_write`

Both write only under `publish.path`:
- `new` creates the page folder and README, and refuses an existing folder;
- `stamp` adds a hash to the README's lead-link line, and never overwrites one.

`ctxr_write`'s guarantees already fit: an owned session is required, and any change to a refused path is restored after the run.

**Alternative rejected: have the agent `Write` the folder and README itself.** `publish new` holds rules a hand-written folder skips: the date prefix on disposable pages, refusing a dated permanent name, refusing an existing folder, and the README skeleton. `stamp` computes the hash the same way `check` does. Reimplementing either in skill prose defeats the point of having the commands.

### D3. The published-pages location joins the widened readable set; the plugin carries the default craft skills

**Reading pages.** `widenedReadablePrefixes` gains `config.publish.path`:
- `nameablePath` and `readablePath` then admit it, and `searchExclusions` stops excluding it from ripgrep;
- retrieval (`find`, `gather`) is a separate path and is unchanged, so pages stay out of retrieval as step 7 requires.

**The craft skills.** Step 5 delegates the page's form to `frontend-design` and its prose to `eli5`, the two skills every store gets by default (`DEFAULT_VENDORED_SKILLS`). The plugin carries both:
- `ctxr plugin build` copies `templates/vendor/<name>/` into `skills/<name>/` in both plugins: `SKILL.md` and `LICENSE.txt`, unchanged.
- It leaves out `provenance.json`, which is the store install's ownership mark and means nothing in a plugin.
- It adds `THIRD_PARTY_NOTICES.md` at the plugin root. `frontend-design` is Apache 2.0 (Anthropic) and `eli5` is MIT, and both licenses allow redistribution with the license text and notice.
- The committed-plugin check compares them with the packaged copies, as it does the rendered skills.

**Step 5 through the server.** Load the plugin's `frontend-design` and `eli5`, unless the store declares a different design or explanation skill. In that case `Read` it from the store's skills path, which is already readable. A shell agent in a checkout reads the step as before, because the store's copy is installed there.

**Decided by the operator (2026-11-13). The case for reading the store's copies instead, which this rejects:**
- A plugin skill is installed for the member's whole app, so `frontend-design` would also apply to their design work outside the store.
- A store that configured a different design skill must rely on step 5's wording to be preferred.
- The plugin then carries third-party text, so a re-vendor in `scripts/vendor-skills.mjs` changes the plugin as well.

**Why bundle anyway:**
- An agent follows a skill it loads natively more reliably than one it is told to `Read` through a connector.
- Every chat member gets the craft guidance even when their app has no design skill of its own. The ChatGPT plugin especially has none.
- Namespacing (`contexture:frontend-design`) keeps the copies from colliding with a same-named skill from another plugin.
- Both copies come from the same pinned upstream revision as a store's, released with the same ctxr version, so a store and a chat member follow the same text.
- Being active outside the store is the price of having it in the store's plugin. A member who doesn't want it can disable the skill in their app.

### D4. Two step-level sentences, and `serve` marked unavailable

The drift check requires a step that names an unavailable command to say how it goes, or that it is skipped, through the server (publish-one-contexture-plugin revision 15). `serve` joins `UNAVAILABLE_COMMANDS`, and:

- **Step 6 (look at the page)** gains: through the store's server, give the person the preview address `ctxr publish new` or `ctxr publish check` reported. Open it yourself only if you can. If you could not, say the page has not been checked visually, and that the approval page shows its preview before anything lands.
- **Step 8 (send copies)** gains: send copies are not made through the store's server, because its file tools write text only. Make one in a checkout of the store.

`templates/mcp/server-instructions.md` stays as it is unless it lists what the server cannot do. Task 3.3 checks.

### D5. A typed command, `/contexture:publish`

`commands.ts` maps `publish` to `ctxr-publish`, like `capture`, `research` and `second-opinion`. Publishing is something a member asks for by name ("make a page of this"), which is what the typed shortcuts are for. The command check already fails if the map names a skill the plugin does not carry, so the map entry and D1 land together.

### D6. The lifespan-step test skips the shared section

Today's test asserts that nothing before `## 1. Permanent or disposable?` is a `##` heading. The shared opening section, now prepended to the store's copy as well, starts with `## Which store, and where`.

The requirement changes from "first step" to "first numbered step after the shared opening section". The test then checks the slice between the end of the shared section and step 1, rather than everything before step 1. The rule it protects, that nothing is decided before the lifespan, is unchanged.

## Risks / Trade-offs

- **[A server older than the plugin refuses `publish new`]** → The shared section's older-server rule already tells the agent to say so and skip a writing step, never to improvise one. The skill then stops at step 4 for that member until the server updates, which stores do daily.
- **[Pages reach review unseen by their author]** → The approval page's pull request preview, and the required "not checked visually" note. A reviewer who wants a polished page can send it back with requested changes.
- **[Widening `Grep` to the published-pages location adds HTML matches to searches]** → Only `Grep`, `Glob` and `Read`, which agents call with a path or pattern. `find`, the retrieval entry point the server instructions point members to, is unchanged.
- **[A store that put `publish.path` under a path it means to hide]** → The published-pages location is already served by the store's serve to its members, so reading it through the server reveals nothing members can't already open.
- **[The bundled craft skills apply outside the store]** → They are namespaced under `contexture:` and can be disabled per member. Step 5 prefers a store's declared skill when one differs.
- **[A re-vendor changes the plugin]** → The committed-plugin check fails until `plugins/contexture/` is regenerated, so a store install and the plugin cannot drift apart.
- **[The store's copy of `ctxr-publish` grows two sentences about the server]** → It is the same text on both surfaces by design. A shell agent reads past the "through the store's server" clauses as it does in the other shared skills.
