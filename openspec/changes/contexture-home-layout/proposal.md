## Why

The first in-place migration of a real store surfaced three out-of-box shape problems:

1. **Root contamination.** A fresh init scatters `catalog/`, `identity/`, and `procedures/` across the store root, alongside the operator's actual content. Real stores already have a convention for tool-owned surface area: one hidden home directory (`.git/`, `.obsidian/`, `.claude/`). contexture should follow it.
2. **Identity is not open-box.** Identity content is only delivered by a harness adapter — a harness with no adapter (or a plain agent reading files) gets no signal that identity exists or that it should be loaded. The canonical entry document is supposed to be sufficient on its own.
3. **Procedures are invisible to skill-discovering harnesses.** Procedures are portable markdown reached by path — correct as the canonical form — but harnesses with native skill auto-discovery (Claude Code's `.claude/skills/`) never surface them. The proven pattern (OpenSpec's `init --tools`) generates thin harness-native mirrors of canonical docs.

## What Changes

- New stores lay all tool-owned files under one home directory: authored-but-tool-owned content at `.contexture/catalog/`, `.contexture/identity/`, `.contexture/procedures/` (tracked), and derived artifacts at `.contexture/cache/` (the sole default gitignored derived path; the graph artifact moves there). All four locations remain configurable exactly as before — existing stores keep whatever paths their config declares, so no migration is needed.
- `AGENTS.md` gains a generated identity section: it names the store's identity files and instructs any agent to load them at session start — so a harness that reads only `AGENTS.md` gets identity without an adapter. Adapters remain the optimized path for harnesses with native injection mechanisms.
- The harness-generation adapter contract gains optional skill generation: `contexture adapters generate` produces one thin, harness-native skill wrapper per canonical procedure (for Claude Code: `.claude/skills/contexture-<name>/SKILL.md`), containing only discovery frontmatter plus a pointer to the canonical procedure file — never duplicated content, same rule as harness entry files.
- **BREAKING**: N/A for existing stores (paths are read from config; defaults only affect new inits). The default-layout change is breaking only in the sense that docs/examples showing root-level `catalog/` become stale.

## Capabilities

### Modified Capabilities

- `context-store`: the default locations for tool-owned files consolidate under one home directory; derived artifacts get a dedicated cache subpath.
- `agent-identity`: the canonical entry document itself references identity, making identity reachable open-box by any harness.
- `harness-portability` / `adapters`: harness-generation adapters may generate native skill wrappers for canonical procedures.

## Impact

Affected code: `src/config/defaults.ts` (four default paths), `src/core/graph/persist.ts` (artifact under the cache path), `src/core/agents-doc.ts` (new identity section), `src/adapters/types.ts` + `src/adapters/harness/claude-code.ts` + `src/commands/adapters-generate.ts` (skill generation), integration tests that assert root-level paths.

## Non-goals

- Migrating existing stores' layouts (config already points wherever they are; a layout move is an operator decision, one `git mv` + config edit).
- Inlining identity content into `AGENTS.md`/`CLAUDE.md` (reference + instruction, not duplication — the entry-file-only-imports rule extends to identity).
- Skill mirrors for harnesses other than the shipped Claude Code adapter (the contract is there; more adapters are future work).
