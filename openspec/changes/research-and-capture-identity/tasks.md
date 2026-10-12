## 1. Research and capture identity

- [x] 1.1 `templates/skills/ctxr-research.md` and the `RESEARCH` seed in `src/core/skills.ts`, with `__SCRATCH_PATH__` and `__LOG_PATH__` substituted.
- [x] 1.2 `ctxr-capture`: the identity convention for unidentified material, the email and URL forms, the prefixed `--source-id`, and reading a deck as images.
- [x] 1.3 `ctxr ingest` refuses an unprefixed `--source-id` (`SourceIdUnprefixedError`). Update the existing tests to prefixed ids.
- [x] 1.4 `ctxr archive` accepts a folder. Update `ctxr-organize-audit` and the command help.
- [x] 1.5 Tests for each scenario, the owned-skill counts, and the README skill table.
- [x] 1.6 Run `npm run typecheck && npm test` and `openspec validate research-and-capture-identity --strict`, and confirm both exit 0.

## 2. Archive keeps the path

- [ ] 2.1 `ctxr archive` places a note or folder at its store-relative path beneath `organize.archive_destination`, creating parent folders, and refuses one already beneath the destination. Update the command help.
- [ ] 2.2 `ctxr-organize-audit`: a folder retires with `ctxr archive <folder>` landing at `__ARCHIVE_DESTINATION__<folder>`; every retired item records what happened and when (hub for a folder, banner for a note); a retired mission priority goes to `ctxr-mission`.
- [ ] 2.3 Tests for each new and changed scenario, including the existing archive tests' destinations.
- [ ] 2.4 Run `npm run typecheck && npm test` and `openspec validate research-and-capture-identity --strict`, and confirm both exit 0.
