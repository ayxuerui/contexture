## 1. Conventions and scanning

- [x] 1.1 Add the conventions path to config (default under the home directory); implement the conventions scanner and the procedures scanner (frontmatter → heading → filename metadata fallback)
- [x] 1.2 New generated AGENTS.md conventions-index section; canonical section's procedure index fed by the scan; wired into init's both paths

## 2. Consumers

- [x] 2.1 `verify --portable` checks every scanned procedure's index entry; `adapters generate` renders skills for the scanned set
- [x] 2.2 Entry file = AGENTS.md import only: remove the shipped claude-code identity-injection adapter (D4); note enumeration skips configured harness entry files at the root
- [x] 2.3 Skills are contexture-owned copies (D5): full `<slug>/SKILL.md` copies synced by init, refreshed by the new `ctxr update`, operator skills untouched; wrapper generation removed; default procedures_path is the skill-discovery directory

## 3. Verify

- [x] 3.1 Unit: scanner metadata fallbacks; conventions index with files/empty; operator-added procedure appears in index + gains a skill; existing shipped-procedure behavior unchanged
- [x] 3.2 Integration: add a convention file + an operator procedure to a real store, re-run init + adapters generate, both appear indexed/skill-wrapped; verify --portable still passes and still fails on a deleted index entry
- [x] 3.3 `npm run build && npm run typecheck && npx vitest run` all green
