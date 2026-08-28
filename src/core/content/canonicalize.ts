/**
 * Reserved home for the canonicalization primitive context-ingest's spec
 * requires exist "in exactly one place in the codebase": strip frontmatter,
 * normalize line endings, trim, collapse trailing blanks, then hash.
 *
 * Phase 3.6 (catalog gloss-rot detection) and Phase 6.1 (ingest dedupe) both
 * import from here — neither may inline or duplicate this logic, even
 * temporarily, which is why the module exists (empty) starting now rather
 * than being created by whichever phase happens to need it first.
 */
export {};
