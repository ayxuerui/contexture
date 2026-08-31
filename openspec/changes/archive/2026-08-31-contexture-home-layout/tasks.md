## 1. Home-directory layout

- [x] 1.1 Move the four defaults: catalog `.contexture/catalog/`, identity `.contexture/identity/`, procedures `.contexture/procedures/`, derived paths `[.contexture/cache/]`; move the graph artifact to the cache path; default exclude_paths covers the home directory
- [x] 1.2 Update integration tests asserting root-level defaults; unit fixtures (hand-built configs) stay valid as legacy-path coverage

## 2. Open-box identity

- [x] 2.1 New generated AGENTS.md section listing the configured identity file paths with a load-at-session-start instruction; wired into init alongside the existing sections

## 3. Skill generation

- [x] 3.1 Extend the harness-generation adapter contract with optional skill generation; implement for the claude-code adapter (`.claude/skills/contexture-<procedure>/SKILL.md` wrappers, frontmatter + pointer only)
- [x] 3.2 `adapters generate` writes skill files idempotently (content-compare before write)

## 4. Verify

- [x] 4.1 Fresh init in a temp dir: root gains only contexture.yaml, AGENTS.md, and .contexture/; catalog/identity/procedures live under .contexture/; .gitignore's managed block ignores .contexture/cache/ only; graph build writes .contexture/cache/graph.json
- [x] 4.2 AGENTS.md names all three identity paths with the load instruction; a config with a custom identity path regenerates the section accordingly
- [x] 4.3 adapters generate produces one SKILL.md per procedure, byte-stable across two runs, each pointing at (not copying) its procedure; `npm run build && npm run typecheck && npx vitest run` all green
