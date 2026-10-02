## 1. Prerequisite

- [x] 1.1 Land `exclude-candidate-from-source-check` (see design.md — Migration Plan). Until `ctxr source check` stops reporting `already_ingested` for a capture carrying only a source id, the procedure this change ships dead-ends on its own output.
- [x] 1.2 Confirm the fix is in: build, then run `ctxr source check` against a capture carrying a source id and neither `source_hash` nor `ingested`, and observe a `new` verdict — `npm run build && node dist/bin.js source check <path> --source-id <id> --json`

## 2. The config key

- [x] 2.1 Add `required_capture_sections` to `IngestSchema` in `src/config/schema.ts` — an optional map from source type to section name, with no shipped default in `src/config/defaults.ts` (the key being absent is what says the store constrains nothing). Document it in the schema comment the way the neighbouring keys are, naming the spec it comes from.
- [x] 2.2 Confirm no `schema_version` bump is needed and none was made: `grep -n 'SUPPORTED_SCHEMA_VERSION' src/config/schema.ts` still reads 10.
- [x] 2.3 `npm run typecheck && npx vitest run test/unit/config-schema.test.ts` — passes.

## 3. The ingest precondition

- [x] 3.1 In `src/commands/ingest.ts`, refuse a capture whose source type carries a declaration when the named section is absent: exit with the check exit code, write nothing (no identity stamped, no move out of the inbox, no note updated, no catalog rebuild). Match the section on heading text at any level, trimmed, case-sensitive (design.md — D6). For material that is not markdown, look in the sidecar, not the binary's bytes.
- [x] 3.2 Tests in `test/` covering all five scenarios in `specs/context-ingest/spec.md`: refused with nothing written, accepted when present, undeclared source type unconstrained, and the sidecar case.
- [x] 3.3 `npx vitest run test/integration/ingest.test.ts test/unit/ingest-command.test.ts` — passes, and the refusal test asserts the exit code, not just the message.

## 4. The lint observation

- [x] 4.1 Add the observation to `src/core/checks/`, alongside the existing inbox checks: inbox material of a declared source type missing its section is reported, naming the capture and the section, and `lint` still exits zero.
- [x] 4.2 `npx vitest run test/unit/lint-command.test.ts test/integration/ingest.test.ts` — passes, with a test asserting lint's exit code is zero while the finding is present.

## 5. The skill

- [x] 5.1 Write `templates/skills/ctxr-capture.md` — the procedure from `specs/harness-portability/spec.md`: locate the material among what the harness has connected without assuming a particular source; write the record as the source supplied it, retaining a source-supplied summary as that source's derivation in its own section; stamp source type and source id (`<source_type>/<the source's own stable identifier>`) and never the two fields ingest assigns; run the dedupe check when the material may already be present; one file per source item into the inbox; hand off to ingest orchestration and stop. No vendor name, no service name, no literal source-type value.
- [x] 5.2 Register the seed in `src/core/skills.ts` — `{file, name, description, body}` as `INGEST_ORCHESTRATION` does — placed first in `SKILLS`, ahead of `ctxr-ingest-orchestration` (design.md — D3). Substitute the inbox path from config rather than writing a literal. Keep the description a plain YAML scalar with no `": "` in it.
- [x] 5.3 Update `test/unit/skills.test.ts`: the ordered skill list gains `ctxr-capture` at the front, and the written-count assertion goes from 14 to 15.
- [x] 5.4 Add the check that keeps the shipped text source-agnostic (`specs/harness-portability/spec.md` — "The capture skill names no particular source"), on the same footing as the existing tier-word and taxonomy-leakage checks in that file.
- [x] 5.5 `npx vitest run test/unit/skills.test.ts` — passes, including the tier-word, flag-attribution, and frontmatter assertions the new skill now runs through.

## 6. Documentation

- [x] 6.1 `templates/agents/capture-and-ingest.md` — point at the skill that now carries the procedure, instead of only describing the file format.
- [x] 6.2 `README.md` — add the skill to the skill table, and correct the capture section that currently says a procedure does not exist ("no CLI wraps this" stays true; "there is nothing to follow" no longer is). Document `ingest.required_capture_sections` where the other optional keys are described.
- [x] 6.3 `npx vitest run test/unit/agents-doc.test.ts test/integration/adapters-and-entry-doc.test.ts` — passes, so the regenerated capture section still matches what the entry document asserts.

## 7. Full verification

- [x] 7.1 `npm run typecheck && npm test` — clean.
- [x] 7.2 End to end against a scratch store: `ctxr init`, declare a required section for a source type, write a capture of that type without the section into the inbox, `ctxr ingest` it and observe exit code 3 with the capture untouched; add the section, ingest again and observe success; `ctxr lint` reports nothing afterwards and exits zero.
- [x] 7.3 `ctxr update` in a store built before this change adds `ctxr-capture` at the configured skills path and reports the change; an immediately repeated `ctxr update` reports nothing changed (byte stability).
- [x] 7.4 `openspec validate capture-is-an-owned-skill --strict` — valid.
