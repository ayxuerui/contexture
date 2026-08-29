## D1 — Conventions mirror procedures, deliberately

Same lifecycle: canonical markdown files at a configured home-directory path (tracked, retrieval-excluded), a generated index section in `AGENTS.md`, references never inlining. One asymmetry: contexture ships procedure seeds but ships NO convention seeds — conventions are definitionally operator-authored.

## D2 — Scan-based indexing, seed-based creation

`ensureProcedureFiles` keeps writing the shipped pack (never overwriting); everything that *reads* the procedure set (index, skills, verify) switches to scanning the directory. This is what makes the docs "generated on the fly": adding a file is the entire integration.

## D3 — Metadata extraction order

frontmatter `title`/`description` → first `# ` heading as title → filename stem. Shipped seeds keep working without edits (they have headings); operator files get full control via frontmatter.

## D4 — A harness entry file references AGENTS.md and nothing else

With identity reachable open-box from AGENTS.md (contexture-home-layout), a harness entry file's only managed content is its AGENTS.md import — the shipped claude-code identity-injection adapter (which wrote identity `@`-imports into CLAUDE.md) is removed as redundant. Harness-specific prose belongs in a referenced conventions doc, not the entry file. Trade-off accepted: Claude Code no longer auto-loads identity files into context; it is instructed to read them at session start. The identity-injection adapter *kind* stays in the contract for harnesses whose delivery genuinely needs a separate mechanism (a symlink, a config entry). Correspondingly, note enumeration skips configured harness entry files at the root — they are tool-owned pointers, not notes.

## Risks

- **[Risk] A store's existing hand-written AGENTS.md prose duplicates generated sections.** → Out of scope to auto-resolve; the conventions mechanism is the destination, the split is per-store editorial work.
