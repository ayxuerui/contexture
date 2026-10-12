## 1. Research and capture identity

- [x] 1.1 `templates/skills/ctxr-research.md` and the `RESEARCH` seed in `src/core/skills.ts`, with `__SCRATCH_PATH__` and `__LOG_PATH__` substituted.
- [x] 1.2 `ctxr-capture`: the identity convention for unidentified material, the email and URL forms, the prefixed `--source-id`, and reading a deck as images.
- [x] 1.3 `ctxr ingest` refuses an unprefixed `--source-id` (`SourceIdUnprefixedError`). Update the existing tests to prefixed ids.
- [x] 1.4 `ctxr archive` accepts a folder. Update `ctxr-organize-audit` and the command help.
- [x] 1.5 Tests for each scenario, the owned-skill counts, and the README skill table.
- [x] 1.6 Run `npm run typecheck && npm test` and `openspec validate research-and-capture-identity --strict`, and confirm both exit 0.
