## Why

The 11 shipped skills' canonical content lives as TypeScript string-array literals inside `src/core/procedures.ts` (740 lines) — a long-form decision-procedure prose, written and reviewed one array element at a time, with no markdown syntax highlighting, no clean diff view, and each line needing its own quoting/escaping. This makes the actual shipped skill text — the part contexture's users read and follow, and the part most worth reviewing carefully — the hardest part of the codebase to review.

`templates/hooks/{pre-commit,pre-push}.sh` already ships real files read from disk with `__PLACEHOLDER__`-style substitution (`src/core/hooks.ts`'s `renderHook`), proving the pattern works and packages correctly (`package.json`'s `files` already includes `templates`). This change extends the same pattern to skills.

## What Changes

- 9 of 11 skill bodies (ingest-orchestration, connection-finding, rollup, session-capture, organize-audit — no interpolation at all; submit, land, session-lifecycle, derived-artifacts — one interpolated value, `config.git.default_branch`) move to plain `templates/skills/<slug>.md` files, read at render time and, where needed, placeholder-substituted — the same mechanism `renderHook` already uses.
- 2 skill bodies (placement, connection-proposal) have genuine per-store branching logic (taxonomy layers present/absent and their termination/retirement framing; relation vocabulary configured or not) that a flat template can't express. Their static prose moves to a template with one clearly-marked insertion point (`__LAYER_STEP__`, `__RELATION_GROUPING_STEP__`); the branching logic itself stays as the existing `placementLayerStep`/`relationGroupingStep` TypeScript functions, called to compute the text substituted at that point.
- **BREAKING**: N/A. Every generated skill file's content is byte-identical before and after — this changes where the canonical text is authored, not what gets shipped. `skip_specs: true` — no spec describes "where the TypeScript source keeps its string literals," so there is no requirement to add, modify, or remove.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
_None — no spec-level behavior changes; see Why/BREAKING above._

## Non-Goals

- `agents-doc.ts`'s 5 generated AGENTS.md sections. Each is mostly a loop over genuinely per-store runtime data (exclusion paths, taxonomy layers, scanned procedures, scanned conventions) rather than fixed prose — extracting them would pull out only a few sentences of wrapper text per section, with most of the actual content unavoidably staying code-generated. Deferred; revisit separately if the skills extraction's reviewability payoff makes the smaller AGENTS.md win still worth it.
- Introducing a real templating engine (mustache, handlebars) with conditionals/loops. The two skills with genuine branching logic (placement, connection-proposal) keep that logic in TypeScript, called to fill one marked insertion point — matching the existing hook-template pattern (`__PLACEHOLDER__` replace-all) rather than adding a new templating dependency for two call sites.
- Changing any skill's actual wording, structure, or decision logic. This is a pure relocation of canonical text; a reviewer diffing this change should see identical rendered output, verified by task-level byte-comparison against the pre-change build.
