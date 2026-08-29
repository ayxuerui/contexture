## D1 — Conventions mirror procedures, deliberately

Same lifecycle: canonical markdown files at a configured home-directory path (tracked, retrieval-excluded), a generated index section in `AGENTS.md`, references never inlining. One asymmetry: contexture ships procedure seeds but ships NO convention seeds — conventions are definitionally operator-authored.

## D2 — Scan-based indexing, seed-based creation

`ensureProcedureFiles` keeps writing the shipped pack (never overwriting); everything that *reads* the procedure set (index, skills, verify) switches to scanning the directory. This is what makes the docs "generated on the fly": adding a file is the entire integration.

## D3 — Metadata extraction order

frontmatter `title`/`description` → first `# ` heading as title → filename stem. Shipped seeds keep working without edits (they have headings); operator files get full control via frontmatter.

## Risks

- **[Risk] A store's existing hand-written AGENTS.md prose duplicates generated sections.** → Out of scope to auto-resolve; the conventions mechanism is the destination, the split is per-store editorial work.
