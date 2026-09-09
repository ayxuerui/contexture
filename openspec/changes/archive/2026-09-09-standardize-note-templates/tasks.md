## 1. Configuration and the note-is-not-a-template boundary

- [x] 1.1 Add `DEFAULT_TEMPLATES_PATH = '.contexture/templates/'` and `DEFAULT_INSTALLED_TEMPLATES` (the packaged library's names, in a fixed appended order) to `src/config/defaults.ts`, and a `templates` entry in `SHIPPED_DEFAULTS`
- [x] 1.2 Add a `TemplatesSchema` (`path`, `installed`) to `src/config/schema.ts`, defaulted from `SHIPPED_DEFAULTS`; no `SUPPORTED_SCHEMA_VERSION` bump (design D10 — a bump would lock existing stores out)
- [x] 1.3 Add `config.templates.path` to `excludedPrefixesFor` in `src/core/notes/list.ts`, beside the skills and guidance paths
- [x] 1.4 Unit tests: a `contexture.yaml` omitting the block resolves to the shipped path and the full installed list; a declared value wins; an empty `installed` list parses; a markdown file under the configured path is absent from `listNotes` for both the default and an overridden path
- [x] 1.5 `npm run typecheck && npx vitest run test/unit/config-schema.test.ts test/unit/json-config-merge.test.ts test/unit/list-notes.test.ts` exits 0

## 2. Write-lifecycle: sanction the templates path before anything writes to it

- [x] 2.1 Add `config.templates.path` to `contextureOwnedPrefixes` in `src/core/write-lifecycle/path-gate.ts`
- [x] 2.2 Unit test: with a `write_lifecycle.writable_paths` allowlist that does not name the templates path, `sanctionedPath` accepts a write under it and still refuses an unsanctioned path
- [x] 2.3 `npx vitest run test/unit/path-gate.test.ts` exits 0

## 3. The packaged library

- [x] 3.1 Author `templates/notes/{Note,Concept,Project,People,Company,Deal}.md` to the drafts in design.md — every template carrying the base's three frontmatter keys and `# {{title}}`, `tags` always a block sequence, no `type:` key, action items under `## Follow-ups` seeded as a comment rather than a live `- [ ]`, exactly one trailing newline
- [x] 3.2 Write the four relation sections into `Concept.md` literally, each with a definition of what belongs under it; no template carries a block placeholder
- [x] 3.3 Use only `{{title}}` and `{{date}}` as placeholders, and no other double-braced text
- [x] 3.4 Apply the heading rule from design D8 — incumbent spelling where store usage is strong, sentence case otherwise — and confirm each shipped section against the evidence recorded in design.md
- [x] 3.5 Test over the packaged files: every template carries the base's frontmatter keys and top-level heading; none contains a contexture ownership header; none contains a double-braced name outside the vocabulary; none carries a live empty checkbox or an unsubstituted block placeholder; each relation heading in `Concept.md` is followed by its definition
- [x] 3.6 `npx vitest run test/unit/note-templates.test.ts` exits 0

## 4. Rendering, the record, and hash-guarded sync

- [x] 4.1 Create `src/core/note-templates.ts`: read each declared template with `packagedTemplate` and normalize it to one trailing newline — fixed content, no per-store substitution (design D4)
- [x] 4.2 Implement the record at `<templates.path>/.ctxr-templates.json`: each delivered template's filename and the sha256 of the rendered bytes contexture wrote
- [x] 4.3 Implement sync: write when absent; rewrite and re-record when the recorded hash matches and a fresh render differs; write nothing when identical; leave the file and report when the hash does not match; remove an unmodified file no longer in the declared list or the library, and report a modified one instead
- [x] 4.4 A file at the path the record does not name is never rewritten, removed, or reported
- [x] 4.5 Unit tests covering each branch of 4.3 and 4.4, plus: a template's bytes do not vary with the store's relation vocabulary; a template whose packaged bytes changed is rewritten; an empty `installed` list removes every unmodified delivered template
- [x] 4.6 `npx vitest run test/unit/note-templates.test.ts` exits 0

## 5. Install and refresh

- [x] 5.1 Call the sync from `src/commands/init.ts`, alongside `seedHouseConventionsFile`
- [x] 5.2 Call the sync from `reconcileStore` in `src/core/reconcile.ts`, alongside `syncShippedSkills`, so `ctxr update` and a re-run of `init` both refresh
- [x] 5.3 Surface the sync's outcome in the update command's report, including any locally modified template by name
- [x] 5.4 Integration tests: a fresh `init` populates the templates path and adds no new root-level entry; a second `update` writes no bytes and reports nothing changed; an operator-edited template survives an update and is named in the output; adding a name to `installed` delivers it on the next update; removing every file at the path leaves every command's behavior unchanged and every check passing
- [x] 5.5 `npx vitest run test/integration` exits 0

## 6. The placeholder lint finding

- [x] 6.1 Add a lint check reporting a note containing `{{title}}` or `{{date}}`, matching the enumerated vocabulary only
- [x] 6.2 Confirm it is registered as a lint finding and not a doctor check
- [x] 6.3 Unit tests: a note with `{{title}}` is reported; a note with unrelated double-braced text is not; `doctor` exits 0 on a store whose only finding is this one
- [x] 6.4 `npx vitest run test/unit/store-checks.test.ts test/integration/note-templates.test.ts` exits 0

## 7. Shipped prose

- [x] 7.1 `templates/skills/ctxr-placement.md`: replace the "read one or two sibling notes and match their shape" instruction with starting from a template at the configured path and substituting the placeholders; direct the agent to a directory's own `README.md` where it states which template notes there start from; keep sibling-reading only for what a template leaves open
- [x] 7.2 `templates/skills/ctxr-ingest-orchestration.md`: split step 5 into starting a new note from a template versus extending an existing one in place, preserving its content
- [x] 7.3 `templates/skills/ctxr-session-capture.md`: `mode: create` names the template the body was started from; `mode: append` states that the existing note is extended, not restarted
- [x] 7.4 `templates/agents/canonical.md`: name the configured templates path in the store-fundamentals section, rendered from configuration
- [x] 7.5 Tests: the rendered skills name the store's configured templates path and no rendered skill instructs the agent to infer a new note's shape solely by imitating siblings; the generated entry document names the path; `AGENTS.md` drift detection is clean after regeneration
- [x] 7.6 `npx vitest run test/unit/skills.test.ts test/unit/agents-doc.test.ts` exits 0

## 8. Documentation and full verification

- [x] 8.1 README: add the templates path to the on-disk store layout, document `templates.installed` beside the existing `skills.vendored` prose, and add a paragraph on starting a note from a template
- [x] 8.2 Fix the stale skill count at `README.md:59` — it says 13, there are 14
- [x] 8.3 Confirm no spec delta names an entity type, a shipped taxonomy profile's layer name, or a real deployment's taxonomy
- [x] 8.4 `npm run typecheck && npm run build && npm test` exits 0
- [x] 8.5 `openspec validate standardize-note-templates --strict` exits 0
- [x] 8.6 End to end in a scratch directory: `ctxr init` populates the templates path; editing `retrieval.relations` leaves every template byte-identical; emptying `templates.installed` and updating removes the unmodified set; a repeated `ctxr update` writes nothing; `ctxr lint` and `ctxr doctor` both exit 0
