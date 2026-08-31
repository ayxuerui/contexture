## Context

See `proposal.md` — Why and What Changes. `ProcedureSeed.body: (config: StoreConfig) => string[]` is called synchronously throughout `procedures.ts` and its test file (`test/unit/procedures.test.ts` calls `renderProcedures(config)` directly, including inside a shared `rendered()` test helper) — nothing awaits it today.

## Goals / Non-Goals

**Goals:**
- Move the 11 skills' canonical text to `templates/skills/<slug>.md`, one file per skill, reviewable as plain markdown.
- Keep `ProcedureSeed.body`'s signature exactly `(config: StoreConfig) => string[]` — synchronous, same shape as today — so no caller (including every existing test) needs to change how it invokes `renderProcedures`.
- Byte-identical rendered output: every generated `SKILL.md` this produces is identical to what today's inline arrays produce, for any config.

**Non-Goals:**
- See `proposal.md`'s Non-Goals (AGENTS.md sections, a real templating engine).
- Changing `syncShippedSkills`, `skillDocument`, `procedurePaths`, or any other `procedures.ts` export's signature — only how `body()` is implemented per seed.

## Decisions

**Load templates synchronously, once, at module init — not `renderHook`'s async `readFile`.** `hooks.ts`'s `renderHook` is `async` because every caller already awaits it. `ProcedureSeed.body` is called synchronously in dozens of places (tests especially), and threading `async` through it would mean awaiting `renderProcedures` everywhere it's called — a much larger, purely mechanical diff across the test suite for no behavioral gain, since the templates are fixed content bundled with the package (known at process start, not runtime-variable per store). Use `readFileSync` in a small loader run once when `procedures.ts` is first imported, caching each template's text in a `Record<string, string>` keyed by slug. This is a deliberate, narrow exception to "prefer async fs" — justified because the alternative forces an unrelated signature change onto a synchronous API with many callers, to read a file whose content never changes after the process starts.

**Template content is the body only, not the whole skill document.** `skillDocument()` already assembles the frontmatter, the managed-header comment, and the `# <name>` H1 generically from `seed.name`/`seed.description`/`seed.file` — a template file is exactly what today's `body: () => [...]` array would join into (the literal lines below the H1), so `skillDocument` needs no change at all.

**Trailing newline handling.** A `.md` file naturally ends with a trailing `\n`; today's arrays never end with a trailing empty string element. The loader strips exactly one trailing `\n` before `.split('\n')`, so a template file that "looks like a normal file" (ends with a newline) produces the same array shape the inline arrays did.

**Placeholder syntax: `__UPPER_SNAKE__`, matching `templates/hooks/*.sh` exactly** (`__CONTEXTURE_BIN__`, `__DEFAULT_BRANCH__` already exist there) — one dialect for every template in the package, not a second convention for skills. Four skills (submit, land, session-lifecycle, derived-artifacts) get one `.replaceAll('__DEFAULT_BRANCH__', config.git.default_branch)` each. Two skills (placement, connection-proposal) get one `.replace('__LAYER_STEP__', ...)` / `.replace('__RELATION_GROUPING_STEP__', ...)` each, substituting the multi-line string `placementLayerStep(config).join('\n')` / `relationGroupingStep(config.retrieval.relations).join('\n')` — those two functions are unchanged, just called from the new `body()` implementation instead of spliced into an inline array.

**No change to packaging.** `package.json`'s `"files"` already includes `"templates"` (proven live by the hooks templates already shipping); `templates/skills/` needs no new packaging entry.

## Risks / Trade-offs

- **[Risk]** A typo in a `__PLACEHOLDER__` name (template says `__DEFAULT_BRANCH__`, code calls `.replace('__DEFAULT_BRANCH_', ...)`) silently ships the literal placeholder text into a real store's `AGENTS.md`/skill file instead of erroring. **[Mitigation]** The byte-identical-output verification (see Migration Plan) catches this immediately — the diff against pre-change output would show the raw placeholder string, impossible to miss.
- **[Risk]** `readFileSync` at module load reads from a path resolved via `import.meta.url`, which must survive being published (dist/ compiled JS resolving `../../templates/skills` relative to itself, not the source tree). **[Mitigation]** This is the exact same resolution `hooks.ts`'s `templatesDir()` already does successfully in the published package — same relative depth (`src/core/*.ts` → `templates/`), reusing the proven pattern rather than inventing a new one.
- Independently revertible: reverting restores the inline arrays; the template files become unused but harmless if left, or can be deleted in the same revert.

## Migration Plan

1. Add `templates/skills/*.md` (11 files) with content extracted verbatim from each seed's current `body()` output (byte-for-byte, before any placeholder substitution).
2. Add the synchronous loader + placeholder substitution to `procedures.ts`; rewrite each seed's `body` to read from the loaded template instead of the inline array.
3. Verification task compares `renderProcedures(config)` output before and after, across at least one config exercising every branch (empty taxonomy, non-empty taxonomy with a terminating and a retired layer, empty relation vocabulary, non-empty relation vocabulary) — byte-identical or the change is not done.
4. Existing tests (`test/unit/procedures.test.ts`) need no logic changes if step 3 holds — they assert on rendered string content, which does not move.

Rollback: revert the commit; no data migration, no store-side effect (the change ships in the next release like any other, and a store's own skill copies are refreshed by `ctxr update` exactly as before — the content is identical, so `update` reports nothing changed for stores already current).
