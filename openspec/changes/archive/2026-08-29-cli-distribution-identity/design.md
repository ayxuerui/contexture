## Context

See proposal.md — Why. Today the name `contexture` plays four roles at once: the npm package and executable (`package.json` `bin`, commander's program name), the text of every shipped instruction that tells an agent what to run (`AGENTS.md` generated sections, procedure seeds, hook scripts, error messages), the name of store-resident artifacts (`contexture.yaml`, `.contexture/`, `contexture:<region>` markers, `contexture-<slug>` skill dirs), and the operator's environment (`CONTEXTURE_ROOT`, `CONTEXTURE_HOME`, `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH`). Only the first two are what a user types or reads as an instruction. Installed hooks already bake the absolute path of the entry point (`__CONTEXTURE_BIN__`), so they never depend on the executable's PATH name.

## Goals / Non-Goals

**Goals:**
- One string across `npm i -g`, `npx`, and the prompt.
- The rename is a config-and-strings change: no migration, no schema bump, no store-resident file moves.
- Existing stores converge on the new name through mechanisms that already exist (idempotent `init` regeneration, `doctor`'s stale-hook self-heal), not through a new one.

**Non-Goals:**
- Any change to how the CLI locates itself, its store, or its config (the rename must not touch `resolveOwnBinPath`, root resolution, or the env-var contract).
- Rewriting `contexture <command>` in existing delta specs (bound once in the cli-contract delta instead).

## Decisions

### D1 — Split the name: `ctxr` for what you type, `contexture` for what a store contains
Rename exactly the executable, the package, and every *instruction to run a command*. Keep the project name on everything store-resident and environmental. Rationale: the problem is typing and distribution; store contents are not typed and renaming them forces a migration on every store for no user-facing gain. The project context also explicitly defers the store's root-noun decision — a wholesale rename now would pre-empt it. Alternatives: rename everything (`ctxr.yaml`, `.ctxr/`, `CTXR_*`) — a migration plus a schema bump for zero command-line benefit; scoped package `@scope/contexture` with bin `ctxr` — install name ≠ command name, and `npx @scope/contexture` is the very thing being escaped.

### D2 — Keep `contexture` as an alias executable
One extra line in the `bin` map. It preserves muscle memory and any operator script written against the old name. The alias is never what docs or generated surfaces name; `ctxr` is canonical everywhere. Alternative: drop it — marginally cleaner, but it breaks existing habits for a saving of one manifest line. Verified that the unrelated npm `contexture` package ships no executable, so the alias cannot collide on a global install.

### D3 — Bind the executable name once, in cli-contract
The project's spec-authoring rule for the visibility key (bind the literal once, refer by role everywhere else) applies verbatim: the cli-contract delta states that `contexture <command>` in any spec denotes the executable. Alternative: edit ~60 scenario lines across four changes' delta specs — churn in historical artifacts, and the next rename would need it again.

### D4 — Hook text changes; hook mechanics do not
The templates' comments, `re-run …` hints, and `contexture:` message prefix become `ctxr` — the prefix identifies the program that is speaking and the same messages tell the operator what to run, so both must agree. The `__CONTEXTURE_BIN__` placeholder and `CONTEXTURE_BIN` shell variable are template internals and stay. Because `detectStaleHooks` compares rendered template text against what is on disk, hooks written by the old release are reported stale and rewritten by `doctor`'s existing self-heal — no new mechanism.

### D5 — The `CONTEXTURE_*` environment variables stay
They belong to the operator's environment (D1) and `CONTEXTURE_ROOT` is part of the documented root-resolution order in `AGENTS.md`. Renaming them would be a silent break for anyone with them exported. Help text keeps naming them as-is.

## Risks / Trade-offs

- **[Risk] `ctxr` is free on npm but unheld; someone else takes it before the first publish.** → Publish a placeholder `ctxr@0.0.x` immediately after this change lands (operator action, listed in the proposal's non-goals as theirs).
- **[Risk] Existing stores keep `contexture <command>` in generated regions and hooks until touched.** → `init` already regenerates fenced sections idempotently on an initialized store, and `doctor` already self-heals stale hooks; the spec's convergence scenario pins both. Hand-written prose outside fences is the operator's (it was never generated), and the alias executable keeps it working meanwhile.
- **[Risk] Two names in the wild (`ctxr`, alias `contexture`) invite mixed docs.** → Every shipped and generated surface names only `ctxr`; the alias is documented in one place (README) as a compatibility alias.
- **[Trade-off] "contexture" in the same string means different things** (`Initialized contexture store` = product; `ctxr init` = executable). Accepted — it is exactly the ripgrep/`rg`, fd-find/`fd` convention, and the project context now states the rule.

## Migration Plan

None for stores. For operators: `npm i -g ctxr`; a previously linked global `contexture` executable continues to resolve via the alias. Rollback is reverting the commit — no store on disk is altered by the rename itself.
