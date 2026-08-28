## 0. Project scaffold, root resolution, config, git bootstrap

Closes: `context-store` (config, git-repository requirements), `harness-portability` (root resolution), `store-lifecycle` (schema version, idempotent init)

- [x] 0.1 Initialize the TypeScript/Node package (`package.json`, `tsconfig.json`, CLI entrypoint, test runner)
- [x] 0.2 Implement root resolution: `--root` → `CONTEXTURE_ROOT` → walk-up from cwd for `contexture.yaml` → fail loud naming what's missing; no alias env var or flag
- [x] 0.3 Define the `contexture.yaml` schema: `schema_version`, taxonomy (layers + defaults), `fields.visibility` (default key + shipped default value), derived-path declarations, retrieval exclusion paths
- [x] 0.4 Define the three shipped taxonomy profiles as data (name, description, layer set): PARA (Projects/Areas/Resources/Archives), Zettelkasten (no layers), Diátaxis (Tutorials/How-to guides/Reference/Explanation)
- [x] 0.5 Implement `contexture init`'s taxonomy selection: an explicit profile name or a custom taxonomy definition, if supplied, is written as-is; interactive terminal with neither supplied prompts with each shipped profile's name and description before writing; non-interactive with neither supplied writes PARA immediately with no prompt
- [x] 0.6 Implement `contexture init`'s remaining scaffold: creates the git repo if absent, writes `contexture.yaml` with schema_version and the resolved taxonomy (from 0.5), writes `.gitignore` entries for every declared derived path, is idempotent on re-run
- [x] 0.7 Implement the schema-version gate: every command reads `schema_version` before operating and refuses (naming the mismatch) if the store's version is newer than supported, or if the field is absent entirely
- [x] 0.8 Implement `contexture doctor` skeleton (enumerates checks with pass/fail/skip; starts with zero checks registered, extended in later phases)
- [x] 0.9 Verify: `CONTEXTURE_ROOT=$(mktemp -d) contexture init </dev/null && contexture doctor` (non-interactive stdin) exits 0, with a git repo and a `contexture.yaml` declaring PARA's layers and no prompt printed; running `init` in a pseudo-tty with no profile piped in prints all three shipped profiles with descriptions and blocks on input; selecting Zettelkasten writes a taxonomy with no layers; passing a custom taxonomy definition writes that instead with no shipped profile's layer names present; a command run in an empty directory with no `--root`/`CONTEXTURE_ROOT` exits non-zero naming that no store root was found

## 1. Note schema, visibility resolution, exclusions, generated regions

Closes: `context-store` (frontmatter schema, marker fences, relocation-as-rename), `context-visibility` (resolution order)

- [x] 1.1 Implement note frontmatter parsing (optional YAML frontmatter; a note with none is valid; no auto-added frontmatter)
- [x] 1.2 Implement visibility resolution: explicit field → directory default (from `contexture.yaml`) → configured fail-closed default, each with a reported resolution reason
- [x] 1.3 Implement the marker-fenced generated-region primitive: locate a fenced region by start/end markers, preserve everything outside it, abort with zero bytes written on a mismatched marker count
- [x] 1.4 Implement `contexture note resolve <path> --json`: prints resolved visibility and resolution reason
- [x] 1.5 Implement the single tracked-rename relocation helper (used later by archive)
- [x] 1.6 Register the "unresolvable/fail-closed visibility" check as a `lint` finding (not a `doctor` failure yet — that's wired in Phase 5)
- [x] 1.7 Verify: `contexture note resolve fixtures/no-frontmatter.md --json` reports the fail-closed default with reason `"fail-closed default"`; a fixture with an explicit field reports reason `"explicit"`

## 2. Write lifecycle: sessions, hooks, review-gated PRs

Closes: `write-lifecycle` (entire capability) — sequenced before any phase below that writes, per the sequencing rule

- [ ] 2.1 Implement `contexture session start`: creates an isolated git worktree off a freshly fetched default branch, on a new branch, and prints the worktree path
- [ ] 2.2 Implement the version-controlled `pre-commit` hook: runs `doctor --staged` (schema conformance, fence integrity, secret-pattern scan, path allowlist, diff-size ceiling), refuses the commit naming the violation on failure
- [ ] 2.3 Implement the version-controlled `pre-push` hook: refuses any push targeting the default branch's remote ref
- [ ] 2.4 Wire hook installation into `contexture init`, and hook detection/reinstallation into `contexture doctor`
- [ ] 2.5 Implement the forge adapter interface and a reference GitHub adapter (open PR, given a pushed branch); document the no-adapter-configured degradation (report manual-PR instructions instead of failing)
- [ ] 2.6 Implement `contexture session submit`: runs full validation, commits, pushes the branch, opens a PR via the configured forge adapter (or degrades per 2.5); refuses to run if validation fails
- [ ] 2.7 Implement `contexture session abandon` and `contexture session list|reap`
- [ ] 2.8 Implement the append-via-queue mechanism: a uniquely named intent file format, and a reconciling operation that applies queued appends to a target shared file in order
- [ ] 2.9 Implement the atomic temp+rename writer used by every derived-artifact writer in later phases
- [ ] 2.10 Verify: `session start` yields a worktree; a direct `git push origin main` from it is refused by the installed hook; a staged note with an unresolvable schema violation is refused at commit; `session submit` on a valid change opens a PR (or reports the manual-PR fallback with no forge configured); two `session start` invocations in a row both succeed with distinct worktrees; two queued appends to one fixture file both survive reconciliation

## 3. Catalog

Closes: `context-catalog` (entire capability)

- [ ] 3.1 Implement `contexture catalog build`: generates each retrievable note's fenced identity/path entry via the Phase 1 generated-region primitive, preserving any existing authored gloss
- [ ] 3.2 Implement per-section catalog files or addressable sections per the store's configured taxonomy
- [ ] 3.3 Implement `contexture catalog check`: exits non-zero naming every retrievable note absent from the catalog; wire this into `doctor`
- [ ] 3.4 Implement `contexture catalog show --section <prefix> [--as <context>]`: sectioned read, filtered by resolved visibility when `--as` is given
- [ ] 3.5 Implement the size-budget check: configured max per section in `contexture.yaml`, `doctor` fails naming the oversized section
- [ ] 3.6 Implement `contexture catalog check --stale`: gloss-rot detection via canonicalized content hash (shared primitive built in Phase 6, stub/inline here if Phase 6 hasn't landed — reconcile in 6.4)
- [ ] 3.7 Verify: running `catalog build` twice in a row produces byte-identical output; deleting a note and re-running `catalog check` exits non-zero naming it; adding it back and rebuilding makes `catalog check` exit 0

## 4. Retrieval: graph, and direct-content-matching guidance

Closes: `context-retrieval` (entire capability)

- [ ] 4.1 Implement `contexture graph build`: path-derived node identity, typed/untyped edge extraction from wikilinks, atomic temp+rename write (via 2.9)
- [ ] 4.2 Implement dangling-link reporting (non-fatal) and identity-collision detection (fatal, non-zero exit, no artifact written)
- [ ] 4.3 Implement `contexture graph query` surface: `neighbors`, `path`, `subgraph`, `hubs`, `orphans` (unfiltered baseline; `--as` filtering added in Phase 5)
- [ ] 4.4 Implement `--emit-records`: stable per-note record `{id, path, visibility, gloss, hash}` from graph/catalog build
- [ ] 4.5 Write the retrieval leg-routing guidance into `AGENTS.md`/procedure docs: name the catalog and the graph as contexture-built-and-maintained tools to consult first; route literal/entity questions to the agent's own direct content matching, scoped by the exclusion paths declared in `contexture.yaml`. No `contexture search` command exists — ranked/semantic search is deferred to v2 (design.md D2) and is out of scope for this change.
- [ ] 4.6 Verify: two fixture notes with identical filenames in different directories produce two distinct nodes in `graph build --json`; a fixture with a genuine identity collision makes `graph build` exit non-zero and write no artifact; a fixture with a dangling link makes `graph build` exit 0 while reporting the dangling link; the generated `AGENTS.md` states the exclusion paths and the leg-routing rule naming catalog/graph/direct-grep; the CLI's command surface contains no `search` command

## 5. Visibility enforcement and disclosure policy

Closes: `context-visibility` (enforcement requirement), `disclosure-policy` (entire capability)

- [ ] 5.1 Wire `--as <context>` into `graph query`: exclude notes by resolved visibility before traversal, not after
- [ ] 5.2 Wire the fail-closed visibility check into `doctor` as a failing (not merely lint) check
- [ ] 5.3 Implement the disclosure ladder: hard walls → explicit audience tag → internal-audience-from-visibility → external default, each rung short-circuiting
- [ ] 5.4 Implement `contexture check <note> --audience <audience>`: tri-state ALLOW/DENY/ASK with distinct documented exit codes, printing the deciding rung
- [ ] 5.5 Verify: `graph neighbors <note> --as ctx-a --json` omits a fixture one-hop neighbor whose resolved visibility `ctx-a` cannot see; `check` against a fixture with a hard wall returns the wall's verdict even when an explicit tag would otherwise allow; `check` against an untagged external audience returns ASK (not DENY or ALLOW) with its own exit code

## 6. Ingest

Closes: `context-ingest` (entire capability)

- [ ] 6.1 Implement the canonicalization primitive (single shared module: strip frontmatter, normalize line endings, trim, collapse trailing blanks) and its content-hash function
- [ ] 6.2 Reconcile Phase 3.6's gloss-rot check to import this shared primitive rather than duplicating it
- [ ] 6.3 Implement capture: writes to the inbox with no source-identity fields
- [ ] 6.4 Implement `contexture source hash` and `contexture source check`: two-stage verdicts (already-ingested / alternate-source-match / multi-match-stop / new), using the shared canonicalization primitive
- [ ] 6.5 Implement ingest's identity assignment: source-type/source-id/source-hash/ingested written once, at ingest, never recomputed from the live body afterward
- [ ] 6.6 Wire the post-ingest condition: a successful ingest leaves `catalog check` green for the new note (either ingest calls `catalog build` itself, or the procedure documentation requires it as the next step — decide and document which)
- [ ] 6.7 Verify: ingesting the same fixture source twice yields `SKIP`/already-ingested on the second run with zero additional writes; two independent fixture notes with genuinely different source-ids but identical canonicalized content are reported as an alternate-source match, not silently merged; editing a note's body after ingest and re-ingesting the same original source does not report content drift

## 7. Organize

Closes: `context-organize` (entire capability)

- [ ] 7.1 Implement the placement procedure as documentation driven entirely by `contexture.yaml`'s configured taxonomy (no hardcoded layer names in code)
- [ ] 7.2 Implement `contexture archive <note>`: single tracked rename (via 1.5), visibility field unchanged, reports every other note whose link now points at the moved path
- [ ] 7.3 Implement `contexture rollup gather <entity>` (agent-facing: enumerates candidate source notes) and `contexture rollup write <entity>` (idempotent fenced write via the Phase 1 primitive, aborts with zero bytes written on marker mismatch)
- [ ] 7.4 Implement `contexture lint`: orphan notes, broken links, uningested inbox material, catalog gaps (cross-referencing Phase 3); always exits 0 regardless of findings
- [ ] 7.5 Verify: `archive` on a fixture note with two inbound links reports both linking notes and preserves `git log --follow` history on the new path; running `rollup write` twice with no new sources is a no-op producing byte-identical output; a fixture with a mismatched fence marker makes `rollup write` exit non-zero having written zero bytes; `lint` on a fixture store with known orphans and broken links still exits 0

## 8. Agent identity, adapters, and harness portability

Closes: `agent-identity` (entire capability), `adapters` (entire capability), `harness-portability` (procedures, adapters, portability test)

- [ ] 8.1 Define the canonical identity file locations (agent posture, durable world facts, durable user facts) under the store's retrieval-exclusion path; confirm catalog and graph never surface them (regression tests against Phases 3–4)
- [ ] 8.2 Implement the adapter discovery/registration mechanism shared by the three v1 adapter kinds (harness-generation, identity-injection, forge), including capability-interface version declaration and the version-mismatch refusal
- [ ] 8.3 Implement `contexture adapters generate`: produces harness-specific files (e.g. a Claude-Code-style entry file that only imports `AGENTS.md` plus harness extras) and the harness's identity-injection mechanism, without duplicating canonical content
- [ ] 8.4 Implement the harness permission-config generator: for harnesses that support it, emit rules denying Write outside the active session worktree and denying raw `git push`/`git commit`
- [ ] 8.5 Write `AGENTS.md`'s canonical template: root-resolution rule, frontmatter schema pointer, write-path rule, and the procedure index
- [ ] 8.6 Write the portable procedure-markdown pack referenced by `AGENTS.md` for the judgment-side operations named throughout (ingest orchestration, placement, connection-finding, organize audit) — these are documentation, not code
- [ ] 8.7 Implement `contexture verify --portable`: runs a retrieval query, a derived-artifact build, and follows one procedure via the `AGENTS.md` index, from an environment scrubbed of harness-specific state; exits non-zero naming the first failing operation
- [ ] 8.8 Verify: `adapters generate` run twice in a row produces byte-identical harness files; `verify --portable` exits 0 in a freshly cloned worktree with no harness state present; deleting the store's `AGENTS.md` procedure index entry for one operation makes `verify --portable` fail naming that operation; the adapter registry accepts a harness-generation, an identity-injection, and a forge adapter, and rejects a fixture adapter declaring an unsupported interface version

## 9. Store lifecycle and integrity

Closes: `store-lifecycle` (migrations), `store-integrity` (entire capability)

- [ ] 9.1 Implement the migration framework: named migrations, `--dry-run` reporting exact deltas with no changes applied, resumability after interruption
- [ ] 9.2 Implement and ship the first real migration: the visibility-field key rename (`fields.visibility` default → an alternate key), exercised against a fixture store, proving the naming-inoculation design (design.md D7) actually holds
- [ ] 9.3 Assemble `contexture doctor --json` as the full aggregation point: derived-artifact staleness, catalog coverage (3.3), dangling links/identity collisions (4.2), unresolved/fail-closed visibility (5.2), schema version currency (0.7), adapter compatibility (8.2), git/hook health (2.4) — each reported with its own pass/fail/skip result
- [ ] 9.4 Confirm no single condition is double-counted as both a `lint` finding and a `doctor` failure; reconcile any overlap found between Phase 7.4 and this phase
- [ ] 9.5 Verify: `migrate --dry-run` against a fixture store pinned one schema version behind prints the exact deltas the rename migration would make, with the fixture file unchanged afterward; running the rename migration for real against a fixture, then reading a note's visibility, resolves correctly under the new key with no other code change; `doctor --json` on a deliberately broken fixture store (a dangling link, an oversized catalog section, a missing hook) reports each as a distinct failing check
