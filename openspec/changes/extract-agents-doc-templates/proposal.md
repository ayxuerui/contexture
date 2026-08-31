## Why

`extract-skill-templates` moved the 11 owned-skill bodies out of TypeScript string arrays and into `templates/skills/*.md`, so the text contexture actually ships is authored and reviewed as markdown. It listed `agents-doc.ts`'s five generated AGENTS.md sections as a Non-Goal, on the reasoning that each is "mostly a loop over genuinely per-store runtime data" and that extracting them "would pull out only a few sentences of wrapper text per section."

That estimate was wrong. Counting rendered output rather than source lines, the five sections emit roughly **75 lines of fixed prose** against **four computed blocks** — exclusion paths, taxonomy layers, procedure index, convention index. That is at most one insertion point per section, and `renderCaptureSection` has none at all: it is 17 lines of pure prose with a single `${config.ingest.inbox_path}` interpolation. The prose dominates; the loops are the exception.

This matters more here than it did for skills. AGENTS.md is the one file the harness-portability spec requires an agent to be able to read *alone* and still operate the store. Its wording is the product, and today that wording is reviewed as quoted, escaped, concatenated TypeScript string fragments with no markdown rendering and no readable diff.

## What Changes

- The five `render*Section` functions in `src/core/agents-doc.ts` read their prose from `templates/agents/<fence-slug>.md`, named for the `htmlCommentFence(...)` slug each section already owns, so the file a reviewer opens and the region it lands in share a name.
- Per-store runtime data stays computed in TypeScript and is substituted into `__UPPER_SNAKE__` placeholders — the same dialect as `templates/hooks/*.sh` and `templates/skills/*.md`, no templating engine. Four of these are *block* placeholders (list bodies); the rest are scalars.
- The two sections that branch on emptiness (`renderPlacementSection` on a zero-layer taxonomy, `renderConventionsSection` on a store with no convention docs) get **two complete template files each**, not one file with a swapped middle — so every template is a full, readable rendering of something that actually ships.
- The synchronous template loader currently private to `procedures.ts` is lifted to `src/core/templates.ts` as a shared `packagedTemplate(dir, name)`. `procedures.ts` keeps its `skillTemplate` as a one-line wrapper; `hooks.ts` is deliberately left alone (see Non-Goals).
- `templates/skills/ctxr-connection-finding.md` and `ctxr-ingest-orchestration.md` stop baking the literal `.contexture/cache/graph.md` and take a `__GRAPH_DOCUMENT_PATH__` placeholder fed from `GRAPH_DOCUMENT_RELATIVE_PATH`, closing a drift risk the sibling change knowingly accepted.
- **BREAKING**: N/A. Every generated AGENTS.md region's content is byte-identical before and after, for any config. This changes where the canonical text is authored, not what gets written into a store. `skip_specs: true` — no spec describes where the TypeScript source keeps its string literals, so there is no requirement to add, modify, or remove.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
_None — no spec-level behavior changes; see BREAKING above._

## Non-Goals

- **Renaming anything.** The term-of-art rename from "procedure" to "skill" — including the `harness.procedures_path` config key, the `### Procedure index` heading this change moves into a template, and the ~60 files that mention it — is deliberately a separate change (`rename-procedures-to-skills`), sequenced after this one. Reason: this change's entire safety property is byte-identical rendered output, and a rename deliberately changes that output. Landing both together would destroy the one verification that makes a 200-line refactor of generated agent instructions reviewable. Sequencing also makes the rename cheaper, because afterwards the prose being renamed lives in markdown files where the diff is readable.
- **Folding `hooks.ts` into the shared loader.** `renderHook` is `async` (every caller awaits it) and must *not* strip a shell script's trailing newline. Sharing a loader would mean either breaking that or parameterising both axes for a single caller. Left as-is.
- **A real templating engine** (mustache, handlebars) with conditionals and loops. The branching stays in TypeScript, called to fill marked insertion points — matching the existing `__PLACEHOLDER__` replace-all pattern rather than adding a dependency for four call sites.
- **Changing any section's wording, structure, or ordering.** This is a pure relocation of canonical text, verified by byte-comparison against the pre-change build.

## Impact

- **New:** `templates/agents/*.md` (7 files), `src/core/templates.ts`.
- **Modified:** `src/core/agents-doc.ts` (the five `render*Section` bodies), `src/core/procedures.ts` (loader becomes a wrapper; two `.replaceAll` calls for the graph-document path), `templates/skills/ctxr-{connection-finding,ingest-orchestration}.md`, `test/unit/agents-doc.test.ts`, `test/unit/conventions.test.ts`.
- **Unchanged:** `package.json` — `"files"` already includes `"templates"`, proven live by the hooks and skills templates already shipping. `src/commands/init.ts` and `src/core/reconcile.ts` — no exported signature changes, so every caller is untouched.
- **Verification burden is higher than the sibling change's.** `extract-skill-templates` could lean on `test/unit/procedures.test.ts`'s exact `toBe` assertions as its byte-identical proof. `agents-doc.test.ts` and `conventions.test.ts` assert only with `toContain`/`toMatch` — they would pass with a dropped blank line, a doubled blank line, or a raw `__PLACEHOLDER__` string shipped into a real store. This change adds its own snapshot comparison and permanent exact-output assertions.
