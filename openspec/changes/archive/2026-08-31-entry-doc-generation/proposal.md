## Why

The migration target's entry documents expose the last big generated-vs-authored seam problem: its `AGENTS.md` is 269 lines of hand-written prose *plus* contexture's appended fenced sections, and the two now partially duplicate each other (both describe placement, capture, visibility, procedures). The store-specific instructions an agent actually needs are frozen prose, not derived from the config that already encodes most of them — so config edits and prose drift apart, and contexture can neither regenerate nor verify the hand-written half.

The proven shape already exists inside contexture twice: procedures are canonical files + a generated index; identity is canonical files + a generated reference section. Entry documents should complete the pattern — everything derivable is generated on the fly; everything genuinely hand-authored lives in referenced convention files, not inline prose.

## What Changes

- **Store conventions become first-class referenced documents**: a configured directory (default under the home directory) of operator-authored markdown, indexed by a new generated `AGENTS.md` section (title + description per file, read from frontmatter with heading/filename fallback). `AGENTS.md`'s recommended steady state is: generated sections + this index; hand-written prose outside fences remains supported but is the migration path, not the destination.
- **The procedure index and skill generation become disk-scan-based**: the index lists every procedure file present at the configured path — the shipped pack and operator-added ones alike — and harness skill wrappers are generated for all of them, not just the shipped four. The shipped pack remains the seed `init` writes; the scan is what the docs and `verify --portable` consult.
- **BREAKING**: N/A — additive config with a default; existing stores' entry docs regenerate with identical content until they add convention/procedure files.

## Capabilities

### Modified Capabilities

- `harness-portability`: `AGENTS.md` indexes operator conventions as referenced documents; the procedure index reflects the files actually on disk; skill generation covers scanned procedures.

## Impact

Affected code: `src/config/schema.ts` + `defaults.ts` (conventions path), new `src/core/conventions.ts`, `src/core/procedures.ts` (scan), `src/core/agents-doc.ts` (conventions section; scan-fed canonical index), `src/commands/init.ts`, `src/commands/verify.ts`, `src/commands/adapters-generate.ts`, test fixtures.

## Non-goals

- Auto-splitting an existing store's hand-written entry-doc prose into convention files (an editorial, per-store migration decision — the mechanism is provided, the split is operator work).
- Conventions participating in retrieval (they live under the home directory, excluded like procedures — they are instructions, not knowledge).
- A markdown template language for generated sections (sections stay code-rendered from config and scans).
