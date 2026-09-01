## 1. Vendored payload and its refresh tooling

- [x] 1.1 Add `scripts/vendor-skills.mjs`: for each entry in a pinned manifest (upstream repo, subpath, ref), fetch the skill's files and its license, write them under `templates/vendor/<name>/`, and record the delivered-file SHA-256 in `templates/vendor/<name>/provenance.json`. Network access lives only in this script, never in `src/`.
- [x] 1.2 Run it to vendor `frontend-design` from `anthropics/skills` at a pinned commit, producing `templates/vendor/frontend-design/{SKILL.md,LICENSE.txt,provenance.json}` with `SKILL.md` byte-identical to upstream.
- [x] 1.3 Add `THIRD_PARTY_NOTICES.md` at the repo root naming each vendored component, its upstream, pinned revision, and license.
- [x] 1.4 Verify: `node scripts/vendor-skills.mjs --check` exits 0 against the committed payload, and non-zero after touching a byte of `templates/vendor/frontend-design/SKILL.md` (restore it afterwards).

## 2. Configuration

- [x] 2.1 Add `DEFAULT_VENDORED_SKILLS = ['frontend-design']` to `src/config/defaults.ts`.
- [x] 2.2 Add `SkillsSchema = z.object({ vendored: z.array(z.string()).default([...DEFAULT_VENDORED_SKILLS]) })` to `src/config/schema.ts` and wire `skills: SkillsSchema.default({ vendored: [...] })` into `StoreConfigSchema`, mirroring how `publish` was made schema-optional-with-default.
- [x] 2.3 Have `src/commands/init.ts` write `skills: { vendored: [...] }` into a freshly generated `contexture.yaml`.
- [x] 2.4 Verify: `npm run typecheck` passes, and a unit test asserts a `contexture.yaml` with no `skills:` key parses and resolves `config.skills.vendored` to the default.

## 3. Harness adapters at interface version 2

- [x] 3.1 In `src/adapters/types.ts`: add `skillsDir: string` to `HarnessGenerationAdapter`, make `entryFileName` and `render` optional, and bump `SUPPORTED_ADAPTER_INTERFACE_VERSION['harness-generation']` to 2.
- [x] 3.2 Update `src/adapters/harness/claude-code.ts` to `interfaceVersion: 2` with `skillsDir: '.claude/skills/'`; leave its entry file and permission config unchanged.
- [x] 3.3 Add `src/adapters/harness/hermes-agent.ts` — `id: 'hermes-agent'`, `interfaceVersion: 2`, `skillsDir: '.hermes/skills/'`, no entry file, no permission config — and register it in `src/adapters/builtin/index.ts`.
- [x] 3.4 Make every entry-file generation site skip an adapter that declares none, rather than assuming `entryFileName`/`render` exist.
- [x] 3.5 Add an optional `skills_dir` to `AdapterDeclarationSchema` so a store can override an adapter's declared directory; resolve it as `declaration.skills_dir ?? adapter.skillsDir`.
- [x] 3.6 Verify: `npm run typecheck && npm test` — existing adapter tests pass, and a fixture adapter declaring `interfaceVersion: 1` is still refused with the existing mismatch error.

## 4. Canonical skills path and the harness bridge

- [x] 4.1 Change `DEFAULT_SKILLS_PATH` to the canonical cross-harness location `.agents/skills/`, and update the fixtures that assert the old default — including the exact `git add` argument vector in `test/unit/git-sequence.test.ts` and the AGENTS.md exclusion-list expectation in `test/unit/agents-doc.test.ts`.
- [x] 4.2 Add `src/core/harness/bridge.ts` with `bridgeHarnessSkills(root, config)`: for each configured harness-generation adapter whose resolved directory differs from `config.harness.skills_path`, make that directory resolve to the canonical one.
- [x] 4.3 Implement the resolution guard first: compare both sides via `realpath`, and again after re-resolving each path's parent through symlinks; if they already name the same real path, do nothing and report nothing. This is what prevents rewriting — or deleting — a canonical directory that is itself reached through a link.
- [x] 4.4 Create the bridge as a directory symlink; on any failure (unsupported platform, filesystem, or permission) fall back to copying every skill into the harness directory. Return per-harness `{ harness, mode: 'symlink' | 'copy' | 'unchanged' }` so callers can report it.
- [x] 4.5 Repair path: when the harness directory exists but neither resolves to the canonical path nor holds the current skills — including a symlink materialized as a regular file, or a link pointing elsewhere — replace it, preferring a symlink and falling back to copy.
- [x] 4.6 Verify: unit tests covering symlink creation, idempotent re-run, copy fallback when symlink creation throws, repair of a regular-file-in-place-of-symlink, repair of a wrongly-pointed link, and the same-real-path no-op through a symlinked parent.

## 5. `syncVendoredSkills`

- [x] 5.1 Add `syncVendoredSkills(root, config)` to `src/core/skills.ts`: for each name in `config.skills.vendored`, for each target directory, write the packaged payload plus a provenance record when absent or when the on-disk delivered file still matches its recorded hash and the payload differs; write nothing when already current.
- [x] 5.2 When the on-disk delivered file's hash does not match its provenance record, leave the whole directory untouched and return a finding naming the skill as locally modified.
- [x] 5.3 Remove a vendored directory contexture previously wrote when its name is no longer in `config.skills.vendored` — but only when its recorded hash still matches, never when locally modified. Never touch a directory lacking a provenance record.
- [x] 5.4 Verify: `npm test` covering write, byte-stable no-op, refresh-on-payload-change, preserve-on-local-edit, remove-on-opt-out, and never-touch-operator-directory.

## 6. Delivery through init and update

- [x] 6.1 Call `syncVendoredSkills` from `src/commands/init.ts` alongside `syncShippedSkills`, including its written paths in the files init stages.
- [x] 6.2 Call it from `src/core/reconcile.ts` so `ctxr update` refreshes vendored skills, surfacing locally-modified findings in the command's report.
- [x] 6.3 Call `bridgeHarnessSkills` from both, after the skills are written, and include each harness's bridge mode in the command's report.
- [x] 6.4 Verify: `npm run build && node dist/bin.js init --root /tmp/vcs1 --profile para` writes `.agents/skills/frontend-design/{SKILL.md,LICENSE.txt}` plus its provenance record, and `node dist/bin.js update --root /tmp/vcs1 --json` reports nothing changed on the second run.

## 6b. Declaring harnesses at setup

- [x] 6b.1 Add `--harness <list>` to `ctxr init` — a comma-separated list of harness adapter ids, plus `none` — recording the selection as declared adapters in the generated `contexture.yaml`.
- [x] 6b.2 Prompt for the selection when `init` runs interactively without the flag, following the existing taxonomy-profile prompt's pattern (`isInteractive`, `@inquirer/prompts`), and apply a documented default without prompting when non-interactive.
- [x] 6b.3 Verify: `node dist/bin.js init --root /tmp/vcs2 --profile para --harness claude-code,hermes-agent` records both adapters and bridges both directories; `--harness none` writes only the canonical directory and exits 0.

## 7. Point the publish skill at the shipped craft skill

- [x] 7.1 Update step 5 of `templates/skills/ctxr-publish.md` to name the shipped craft skill as the default to load, while keeping the delegation configurable for stores that install their own.
- [x] 7.2 Verify: `npm test` — the existing skill-content guards still pass for `ctxr-publish` (no shipped-profile or layer names, no visibility-value words, `ctxr` never the project name).

## 8. Tests

- [x] 8.1 Add a guard test asserting the committed `templates/vendor/**` payload matches its recorded hashes, so hand-editing vendored content fails CI.
- [x] 8.2 Add a test asserting vendored content is exempt from the owned-skill content guards, with a comment stating why, so the exemption is not "fixed" later by widening the loop.
- [x] 8.3 Add an integration test: a store declaring both harness adapters resolves both harness directories to the canonical one (or holds full copies where symlinks are unavailable), every owned and vendored skill is readable through each, and `AGENTS.md` still indexes only the configured skills path.
- [x] 8.3b Add a `doctor` test: a harness directory replaced by a regular file is reported as a broken bridge, and `update` repairs it.
- [x] 8.4 Update any existing test that asserts an exact skills-directory file list or the owned-skill count.
- [x] 8.5 Verify: `npm test` passes in full.

## 9. Final verification

- [x] 9.1 `npm run typecheck && npm run build && npm test` — all green.
- [x] 9.2 Against scratch stores, run the sequence in the change's design/proposal: default init lands skills in `.agents/skills/`; a store declaring both harnesses resolves `.claude/skills` and `.hermes/skills` to it (`readlink`/`realpath` to confirm, or full copies on a symlink-less filesystem); a second update is a no-op; an operator edit survives an update and is reported; replacing a bridge with a regular file is reported by `doctor` and repaired by `update`; `skills.vendored: []` removes the unmodified vendored directory; `ctxr verify --portable` exits 0.
- [x] 9.3 `openspec validate vendored-craft-skills --strict` exits 0.
