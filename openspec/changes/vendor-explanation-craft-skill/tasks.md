## 1. The license seam, before any payload changes

- [x] 1.1 In `scripts/vendored-manifest.mjs`, add `LICENSE_FILE_NAME`, `assemblePayload(entry, subpathFiles, externalLicense)`, and `differingPaths(upstream, committed)` — pure, no network, no filesystem — and widen the module's header comment from "pure renderings" to cover derivations too.
- [x] 1.2 Have `assemblePayload` throw when an entry declares neither an in-subtree license nor a `licensePath`, and when it declares both, so the redistribution obligation fails at fetch time rather than at test time.
- [x] 1.3 In `scripts/vendor-skills.mjs`, add `fetchFile(repo, filePath, ref)` and `fetchPayload(entry, ref)`, and route BOTH the fetch path and the drift check through `fetchPayload` so they cannot disagree about what a payload contains.
- [x] 1.4 Have the fetch path record `licensePath` in `provenance.json` only when the manifest entry sets it (conditional spread, not a key set to undefined), so the existing entry's record round-trips byte-identical.
- [x] 1.5 Add the conditional license-source bullet to `renderNotices`, rendered only for an entry whose license came from outside its vendored subtree.
- [x] 1.6 Verify nothing regressed before the payload changes: `node scripts/vendor-skills.mjs --check; echo $?` prints `OK: frontend-design matches its recorded hash` then `0`, and `git status --porcelain` lists only the two `scripts/` files.

## 2. Vendor the payload

- [x] 2.1 Append the `eli5` manifest entry: repo `DreambigOu/ELI5`, subpath `skills/eli5`, ref `a766623b062331fdde53467001379b4ddf3acc2f`, tracking `main`, MIT, `licensePath: 'LICENSE'`, and a copyright value that repeats upstream's holder-less notice rather than inferring one.
- [x] 2.2 Fetch it: `node scripts/vendor-skills.mjs` prints `vendored eli5 <- DreambigOu/ELI5/skills/eli5@a766623b0623 (2 file(s))` and rewrites `THIRD_PARTY_NOTICES.md`. Requires network and an authenticated `gh`; never hand-write the payload.
- [x] 2.3 Verify the working tree gained exactly `templates/vendor/eli5/{SKILL.md,LICENSE.txt,provenance.json}` plus the notices file, and that `templates/vendor/frontend-design/` is untouched: `git status --porcelain`.
- [x] 2.4 Verify the hash guard and — the load-bearing one — the absence of false drift: `node scripts/vendor-skills.mjs --check; echo $?` prints `0`, then `node scripts/vendor-skills.mjs --outdated; echo $?` reports BOTH entries `CURRENT` and prints `0`. An `eli5` reported `OUTDATED` here means the license assembly is wrong, not that upstream moved.

## 3. Ship it in the default set

- [x] 3.1 Append (do not sort in) `eli5` to `DEFAULT_VENDORED_SKILLS` in `src/config/defaults.ts`, and update its doc comment to describe the set as one skill per craft axis.
- [x] 3.2 Add the optional license-path field to `VendoredProvenance` in `src/core/skills.ts`, and sort `readVendoredPayload`'s directory walk so the paths init stages do not depend on the filesystem's directory order.
- [x] 3.3 Extend `test/unit/vendored-payload-integrity.test.ts`: assert the provenance license path matches the manifest; assert every entry declaring one ships a non-empty `LICENSE.txt`; add a network-free block over `assemblePayload`/`differingPaths` covering unchanged-is-current, a changed license IS drift, and both refusal cases.
- [x] 3.4 Update `test/unit/git-sequence.test.ts` (three staged `eli5` paths after the existing entry's), `test/integration/vendored-skills-and-bridge.test.ts` (read `eli5/SKILL.md` through each bridged harness), and `test/unit/skills.test.ts`'s vendored-exemption guard (iterate `DEFAULT_VENDORED_SKILLS` instead of hardcoding one name, keeping its existing comment verbatim).
- [x] 3.5 Add a `test/unit/vendored-skills.test.ts` case: a store declaring both writes both directories with their own provenance sidecars, and opting one out removes only that one.
- [x] 3.6 Make `test/integration/cli-name.test.ts` select an owned skill by its `skills/ctxr-` prefix rather than by unsorted directory order — a second vendored entry worsens a pre-existing latent flake.
- [x] 3.7 Verify: `npx vitest run test/unit/vendored-payload-integrity.test.ts test/unit/vendored-skills.test.ts test/unit/git-sequence.test.ts test/integration/vendored-skills-and-bridge.test.ts test/integration/cli-name.test.ts --exclude '**/.claude/**'; echo $?` prints `0`.

## 4. Propagate to stores already on disk

- [x] 4.1 Add `src/core/migrations/add-explanation-craft-skill.ts` following the archive-destination migration's shape: pending-ness is the recorded schema version (never the list's contents), `plan()` returns the config delta, `apply()` re-reads config before writing via the atomic writer.
- [x] 4.2 Append the new skill only when the store's declared vendored list still exactly equals the previous shipped default; a curated or emptied list keeps its value and gets a bare version bump.
- [x] 4.3 State in the migration's doc comment that this bump is additive, that the configuration schema's rule reserves bumps for incompatible changes, and why the trade was made anyway — so the precedent is not read as permission.
- [x] 4.4 Register it in `src/core/migrations/registry.ts` and raise `SUPPORTED_SCHEMA_VERSION` in `src/config/schema.ts`.
- [x] 4.5 Add `test/unit/migration-add-explanation-craft-skill.test.ts` mirroring the existing migration tests: appends on a store at the old default; leaves a customized list alone; leaves an emptied list alone; bumps the version in every case; is idempotent on re-run; and reports its delta under dry-run without writing.
- [x] 4.6 Update the tests that enumerate the shipped migrations or pin the current schema version — `test/unit/migrations.test.ts` and `test/unit/migrate-command.test.ts` — pointing the version assertions at `SUPPORTED_SCHEMA_VERSION` rather than a literal, so the next bump does not break them again.
- [x] 4.7 Verify: `npx vitest run test/unit/migration-add-explanation-craft-skill.test.ts test/unit/config-schema.test.ts --exclude '**/.claude/**'; echo $?` prints `0`.

## 5. Point the publish skill at both axes

- [x] 5.1 Replace step 5 of `templates/skills/ctxr-publish.md` with the two named axes (visual form and its interface copy; the prose that explains the subject), the seam between them, and the paragraph separating the reader's level of knowledge from the gate's disclosure audience. Hard-wrap to the file's existing width, preserving the two line breaks the current assertions span.
- [x] 5.2 Keep the rendered text clear of the content guards: no tier word (case-insensitive), no shipped profile or taxonomy layer name — note that one shipped layer is the capitalized word for an explanation, so that word stays lowercase and never opens a sentence — `ctxr` never spelled as the project name, and no surviving template placeholder.
- [x] 5.3 Convert the two line-break-spanning assertions in `test/unit/skills.test.ts`'s publish block to whitespace-tolerant forms, and add pins for both axis headings, the second skill's delegation, and the two-senses-of-audience rule.
- [x] 5.4 Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'; echo $?` prints `0`, including the cross-cutting content guards.

## 6. End to end on a scratch store

- [x] 6.1 `npm run build && node dist/bin.js init --root /tmp/eli5-store --profile para --harness claude-code`, then `ls -A /tmp/eli5-store/.agents/skills/eli5` lists `SKILL.md`, `LICENSE.txt`, and the provenance sidecar.
- [x] 6.2 `head -3 /tmp/eli5-store/.agents/skills/eli5/SKILL.md` shows upstream's own frontmatter as line 1 — no contexture-authored header — and the sidecar names the upstream license path.
- [x] 6.3 `node dist/bin.js update --root /tmp/eli5-store --json` reports nothing changed on a second run, and `node dist/bin.js verify --portable --root /tmp/eli5-store --json; echo $?` prints `0`.
- [x] 6.4 On a store fixture written at the previous schema version with the previous default list: `node dist/bin.js migrate --root <fixture> --dry-run --json` names the config delta without writing, `node dist/bin.js migrate --root <fixture> --json` applies it, and a second run reports nothing pending; `echo $?` prints `0` for each.

## 7. Full verification

- [x] 7.1 `npm run typecheck && npm run build && npx vitest run --exclude '**/.claude/**'; echo $?` prints `0`.
- [x] 7.2 `npm pack --dry-run 2>&1 | grep -c 'templates/vendor/eli5'` prints `3`, and `npm pack --dry-run 2>&1 | grep -c '^npm notice.*scripts/'` prints `0`.
- [x] 7.3 `openspec validate vendor-explanation-craft-skill --strict; echo $?` prints `0`.
- [x] 7.4 `git status --porcelain` lists only: the three `scripts/` files (the manifest, its type declaration, and the fetch tool), `templates/vendor/eli5/**`, `THIRD_PARTY_NOTICES.md`, `templates/skills/ctxr-publish.md`, `src/config/{defaults,schema}.ts`, `src/core/skills.ts`, `src/core/migrations/**`, the touched test files, and this change's artifacts.

## 8. After it lands

- [ ] 8.1 `gh workflow run vendor-check.yml && gh run watch` — the dispatched run reports both entries current and files no issue. This is the durable proof that a license sourced from outside the vendored subtree does not manufacture weekly drift.
- [ ] 8.2 `gh api repos/ayxuerui/contexture/issues --jq '[.[] | select(.labels[].name == "vendored-skill-update")] | length'` prints `0` a week after landing.
