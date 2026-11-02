## 1. Configuration and the commit gate

- [x] 1.1 Add the optional `shared_stores` list (`[{ name, url }]`) to `StoreConfigSchema`, mounted at the fixed `shared/<name>`, with no `SHIPPED_DEFAULTS` entry and no prefault; refuse a name that is not one slug-stable segment, and duplicate names
- [x] 1.2 Unit tests: a config without the key round-trips with no `shared_stores` key written; each refusal names its entry
- [x] 1.3 Add the `shared_stores.untracked` doctor check (store and staged scopes): fail on any tracked or staged path under `shared/`, naming each
- [x] 1.4 Integration test: force-add a file under `shared/ctx-b`, attempt a commit, and assert the pre-commit hook refuses it
- [x] 1.5 Run `npx vitest run test/unit/config test/integration -t "shared"` and confirm it exits 0

## 2. Sync, status, and the exclude entry

- [x] 2.1 Extract the canonical-sync conditions from `land.ts` into one shared helper, without changing `land`'s behavior
- [x] 2.2 Add `ctxr shared-stores sync`: clone absent mounts, fast-forward clean on-branch mounts, leave others with a reason, exit non-zero naming any unreachable mount after processing the rest; write the `shared/` entry into the repository's local exclude file, never a tracked file
- [x] 2.3 Add `ctxr shared-stores status`: per mount, present, is a store, branch, commit, dirty; no writes, no network
- [x] 2.4 Integration test: sync in a clean mounting store leaves `git status` clean, and a session worktree of it also ignores `shared/`
- [x] 2.5 Integration tests against local bare repositories: clone, fast-forward, dirty/wrong-branch/diverged left alone, unreachable mount exits non-zero, status changes nothing
- [x] 2.6 Run `npx vitest run -t "shared-stores"` and confirm it exits 0

## 3. Root resolution

- [x] 3.1 Add the mount step to root resolution: under `CONTEXTURE_STORE_ROOT` with no `--root`, a root found from the working directory at a declared mount location (or a worktree of one) wins; decided from the filesystem plus the named store's configuration, falling back to the variable when undecidable
- [x] 3.2 Tests for each new scenario, plus the existing precedence scenarios unchanged
- [x] 3.3 Integration test: `ctxr session start` from inside `shared/ctx-b` creates the worktree and branch in `ctx-b` only
- [x] 3.4 Run `npx vitest run -t "root resolution"` and confirm it exits 0

## 4. The read view and link resolution

- [x] 4.1 Exclude `shared/` from the store's own note enumeration
- [x] 4.2 Add the read-view enumeration: own notes, plus each present mount (read from the main working tree) that loads as a store, admitted by its own configuration, paths prefixed by its location; report absent mounts
- [x] 4.3 Switch the graph build and the retrieval pass to the read view; make the persisted-graph loader's admission check per owning store
- [x] 4.4 Scope link resolution to the owning store: stem index per store, plus path links resolved against the owning store's root; ambiguity decided per store; apply the same resolver in `serve`'s link rendering
- [x] 4.5 Tests for every context-retrieval scenario in this change, including a store with no mounts producing a byte-identical graph except for path links that now resolve
- [x] 4.6 Add the lint observation: a mounted note's link that dangles in its own store but resolves among the mounting store's notes, naming all three; test both scenarios
- [x] 4.7 Run `npx vitest run test/unit/graph test/integration -t "mount|path link"` and confirm it exits 0

## 5. Catalog show

- [x] 5.1 Make `ctxr catalog show --section` append each present mount's same section from its tracked catalog, under a heading naming the mount, with prefixed paths; write nothing
- [x] 5.2 Confirm `catalog build` and `catalog check` ignore `shared/`
- [x] 5.3 Run `npx vitest run -t "catalog"` and confirm it exits 0

## 6. Entry document and skills

- [x] 6.1 Render the shared-stores section after placement when mounts are declared, from a template in `templates/`, never a string literal; confirm the default-store ceiling test is unchanged
- [x] 6.2 Update `ctxr-placement`: ask who should see a note before which layer, default to the person's own store
- [x] 6.3 Update `ctxr-session-lifecycle`: run `ctxr shared-stores sync` at session start; start a session inside the mount for a write to a shared store
- [x] 6.4 Update `ctxr-submit` and `ctxr-land` for a change in a mount (its own forge, its own approval page); add the share-as-a-move procedure: settle each outgoing link to a note that stays private (share it too, flatten it to text, or stop), land in the shared store first, then remove and relink in the personal store and state that unsharing protects only later edits
- [x] 6.5 Update `ctxr-connection-finding` and `ctxr-rollup` to gather across the read view and write path links into mounts
- [x] 6.6 Check every edited skill for the banned tier words and flag attribution, and rewrite touched steps to controlled English with `Why:` sentences kept
- [x] 6.7 Run `npx vitest run -t "entry document|skills"` and confirm it exits 0

## 7. Project context and end-to-end

- [x] 7.1 Change the tenancy paragraph in `openspec/config.yaml` from "single-owner context store" to "one audience per store; privacy between people is a store boundary"
- [x] 7.2 Add an end-to-end test: `ctx-a` mounts `ctx-b`; sync; a note in `ctx-a` path-links into `ctx-b`; `graph build` resolves it; a session in `ctx-b` lands a note; a second sync fast-forwards it into `ctx-a`'s view
- [x] 7.3 Run `npm run build && npx vitest run` and confirm both exit 0
- [x] 7.4 Run `openspec validate mount-shared-stores --strict` and confirm it reports the change valid
