## Context

See `proposal.md` — Why and What Changes.

Three constraints shape the approach:

1. **Every `render*Section` is synchronous.** `renderLegRoutingSection`, `renderCaptureSection`, `renderPlacementSection`, `renderCanonicalSection`, and `renderConventionsSection` all return `string[]` directly, and `test/unit/agents-doc.test.ts` and `test/unit/conventions.test.ts` call them synchronously throughout. Only the `buildAgents*Section` wrappers are `async`, because `upsertFencedRegionInFile` and the disk scans are.
2. **The loader already exists, one module over.** `src/core/procedures.ts:21-33` has exactly the needed primitive — `fileURLToPath(new URL('../../templates/skills', import.meta.url))`, `readFileSync`, strip one trailing `\n`, cache in a `Map` — private to that module. `agents-doc.ts` sits at the same directory depth, so the same relative resolution works unchanged.
3. **The existing tests cannot prove byte-identity.** Unlike `test/unit/procedures.test.ts`, which asserts exact rendered content and so served as `extract-skill-templates`'s own proof, the AGENTS.md tests assert with `toContain`/`toMatch` only. Every one of them would pass against output with a dropped blank line, a doubled blank line, or a literal `__PLACEHOLDER__` in it.

## Goals / Non-Goals

**Goals:**
- Move the five sections' fixed prose to `templates/agents/*.md`, reviewable as plain markdown.
- Keep every exported signature in `agents-doc.ts` exactly as it is — `renderX(config, ...): string[]`, `buildAgentsXSection(root, config): Promise<{changed: boolean}>` — so `init.ts`, `reconcile.ts`, `verify-command.test.ts`, and the unit tests need no call-site changes.
- Byte-identical rendered output for every section, every config, **including the empty-list cases**.
- Leave exactly one loader implementation in the codebase for packaged markdown templates.

**Non-Goals:**
- See `proposal.md`'s Non-Goals (the procedure→skill rename, `hooks.ts`, a templating engine, any wording change).
- Extracting the fence constants, `agentsMdPath`, `excludedPrefixesFor`, the per-layer `directory_defaults` lookup, or the branch predicates. None of that is prose.

## Decisions

### One template file per rendered branch, not per section

Seven files for five sections. `placement.md` / `placement-no-layers.md` and `store-conventions.md` / `store-conventions-empty.md` are each a complete, standalone rendering of what ships in that case; the TypeScript picks which one to load.

*Alternative considered — one file per section with the whole variable middle substituted:* rejected because the empty-branch prose ("This store's taxonomy declares no top-level layers…", "This store declares no convention documents yet…") would then live back in TypeScript, which is precisely what the change is removing.

*Alternative considered — a `__HARNESS_SPECIFIC_NOTE__` partial shared by both conventions files:* rejected because a reviewer opening either file would no longer see the full shipped text in one place, which is the change's whole purpose.

The cost is duplicated shared text — one heading line between the placement files, and the three-line harness-specific-note paragraph (today the `HARNESS_SPECIFIC_NOTE_GUIDANCE` constant, `agents-doc.ts:190-193`) between the conventions files. **Mitigated by a test**, not by discipline: a unit test asserts both conventions branches end with a byte-identical paragraph, so drift fails loudly rather than shipping two divergent instructions to agents.

### Template filenames are the fence slugs

`retrieval-leg-routing.md`, `capture-and-ingest.md`, `placement.md`, `canonical.md`, `store-conventions.md` — the exact strings already passed to `htmlCommentFence(...)`. The two extra branch files append a suffix naming their branch (`-no-layers`, `-empty`). Someone reading a store's AGENTS.md sees `contexture:placement` in the fence marker and can find the source file without a lookup table.

### `packagedTemplate(dir, name)` in `src/core/templates.ts`; `hooks.ts` stays out

The loader lifts verbatim out of `procedures.ts` with the directory as a parameter. `procedures.ts` keeps `skillTemplate(slug)` as a one-line wrapper so its call sites are untouched.

`hooks.ts` deliberately does not adopt it. `renderHook` is `async` (every caller awaits), and it must **not** strip the trailing newline — a POSIX shell script needs it. Sharing would mean parameterising both sync/async and strip/no-strip for one caller; the duplication is four lines and the two have genuinely different contracts.

### Synchronous read, cached at first use

Same reasoning as `extract-skill-templates`, and stronger here: the render functions are synchronous with many synchronous call sites, and these are fixed package-bundled files whose content cannot change after process start. Threading `async` through `render*Section` would force `await` onto `init.ts`, `reconcile.ts`, and every assertion in two test files — a large mechanical diff for no behavioral gain. This remains a deliberate, narrow exception to "prefer async fs."

### Two substitution kinds, because empty lists are the byte-identical trap

**Scalar** — `.replaceAll('__TOKEN__', value)`, matching `hooks.ts` and `procedures.ts`.

**Block** — its own helper, because `.replace(token, lines.join('\n'))` is *not* byte-identical when the list is empty. Today `renderCanonicalSection(config, [])` ends with a single trailing `''`: line 170 pushes it, then the loop contributes nothing. A template whose last line is the bare `__PROCEDURE_INDEX__` token would substitute `''` and leave that line behind as a second blank. So:

> `substituteBlock(text, token, lines)` — when `lines` is empty, remove the token's **entire line**; otherwise replace the token in place with `lines.join('\n')`.

This is reachable in production, not theoretical: `scanProcedures` returns `[]` whenever the configured directory is missing. It also covers `__EXCLUSION_PATHS__` (structurally identical, though `excludedPrefixesFor` always yields at least four entries in practice) and both index blocks.

### Placeholder inventory

| Template | Scalars | Blocks |
|---|---|---|
| `retrieval-leg-routing.md` | `__GRAPH_DOCUMENT_PATH__` | `__EXCLUSION_PATHS__` |
| `capture-and-ingest.md` | `__INBOX_PATH__` | — |
| `placement.md` | — | `__LAYER_LIST__` |
| `placement-no-layers.md` | — | — |
| `canonical.md` | `__CONFIG_FILE_NAME__`, `__VISIBILITY_FIELD__`, `__DEFAULT_CONTEXT__`, `__PROCEDURES_PATH__` | `__PROCEDURE_INDEX__` |
| `store-conventions.md` | — | `__CONVENTION_INDEX__` |
| `store-conventions-empty.md` | `__CONVENTIONS_PATH__` | — |

`renderCanonicalSection` currently assembles four of its output lines by concatenating source-line fragments (`agents-doc.ts:148-150`, `154-155`, `161-163`, `167-168`). Each becomes one long line in `canonical.md`. That is the readability win, and it is byte-identical — the concatenation was a source-formatting artifact, never part of the output.

### `__GRAPH_DOCUMENT_PATH__` extends to the two skill templates

`agents-doc.ts` already imports `GRAPH_DOCUMENT_RELATIVE_PATH`, so the leg-routing template needs this token regardless. `templates/skills/ctxr-connection-finding.md:5` and `ctxr-ingest-orchestration.md:16` currently bake the literal `.contexture/cache/graph.md`, which goes stale silently if the constant moves — `extract-skill-templates` accepted that knowingly to avoid adding an import. The import cost is now zero and the fix is one `.replaceAll` per seed, so the same token covers all three sites and the drift risk leaves the templates tree entirely.

### No packaging change

`package.json`'s `"files"` already includes `"templates"`, proven live by `templates/hooks/` and `templates/skills/` both shipping. `templates/agents/` needs no entry — verified by task, not assumed.

## Risks / Trade-offs

- **[Risk]** A mistyped placeholder name ships the literal `__TOKEN__` string into a real store's AGENTS.md instead of erroring. → **Mitigation:** the snapshot diff (Migration Plan step 4) surfaces it as an obvious diff, and the new permanent exact-output assertions keep catching it afterwards. The loose `toContain` tests would not have.
- **[Risk]** The empty-list blank-line case is invisible in review — a human diffing markdown does not reliably see one blank line too many. → **Mitigation:** the branch matrix explicitly includes `[]` for both the procedure and convention indexes; `substituteBlock` is unit-tested directly on the empty case.
- **[Risk]** Duplicated harness-specific-note prose across the two conventions templates drifts, so agents get different instructions depending on whether a store has convention docs. → **Mitigation:** the drift test above. This is the accepted cost of the "every template is a complete rendering" decision.
- **[Risk]** `readFileSync` resolves relative to `import.meta.url`, which must survive publishing (compiled `dist/` JS resolving `../../templates/agents` relative to itself, not the source tree). → **Mitigation:** identical resolution and identical directory depth to `hooks.ts` and `procedures.ts`, both already proven in the published package; `npm pack --dry-run` confirms inclusion.
- Independently revertible: reverting restores the inline arrays. The template files become unused but harmless if left behind.

## Migration Plan

1. Add `src/core/templates.ts` with `packagedTemplate` and `substituteBlock`; reduce `procedures.ts`'s loader to a wrapper.
2. Add the 7 `templates/agents/*.md` files, extracted verbatim from each section's current output (before substitution).
3. Rewrite the five `render*Section` bodies to load, substitute, and `.split('\n')`. Delete the now-unused inline arrays and `HARNESS_SPECIFIC_NOTE_GUIDANCE`.
4. **Snapshot diff:** dump all five sections' output across the branch matrix from a `HEAD` build and from the rewritten build; `diff` must be empty. Matrix: default config; a ≥2-layer taxonomy where one layer has a `directory_defaults` entry and one does not; a zero-layer taxonomy; procedure index `[]` and populated (entries with and without `description`); convention index `[]` and populated; non-default `fields.visibility`, `ingest.inbox_path`, `harness.procedures_path`, `harness.conventions_path`, `visibility.default_context`.
5. Add permanent exact-output assertions (one `toBe` on the joined string per section) plus the conventions drift test, so the guarantee survives this change rather than being a one-off script.

Rollback: revert the commit. No data migration and no store-side effect — the generated content is identical, so `ctxr update` reports nothing changed for stores already current.
