Proposed, not implemented — this change records a design decision (see `design.md`). Implementation is a
separate, separately-requested pass.

Phases 1–5 are sequenced so the tree never sits at a commit where the config schema and the code reading it
disagree: the modules go first, then the surface that called them, then the schema they read, then the
migration that rewrites stores.

## 1. Delete the axis modules

- [x] 1.1 Delete `src/core/notes/visibility.ts`, `src/core/graph/visibility-filter.ts`,
      `src/core/disclosure/model.ts`, `src/core/disclosure/leak-scan.ts`, and
      `src/core/checks/disclosure-checks.ts`.
- [x] 1.2 `src/core/notes/checks.ts`: drop `failClosedVisibilityCheck` and
      `failClosedVisibilityInvariantCheck`; `src/core/checks/manifest.ts`: deregister them and
      `DISCLOSURE_CHECKS`.
- [x] 1.3 Verify: `grep -rn "canSee\|resolveVisibility\|evaluateDisclosure\|scanNoteForLeaks" src/` returns
      only the call sites phases 2–4 remove, and lists no file outside them.

## 2. Remove the command surface

- [x] 2.1 Delete `src/commands/check.ts` and `src/commands/note-resolve.ts`; drop the `check` command and
      the `note` command group from `src/run.ts` along with their imports.
- [x] 2.2 `src/run.ts`: drop `--as` from graph query (every subcommand carrying it), catalog show, and
      publish gather, and `--audience` from publish gather.
- [x] 2.3 Drop the now-dead requesting-context parameters: `NoteQuery.as` in `src/core/notes/list.ts` and
      `readCatalogSection`'s `asContext` in `src/core/catalog/build.ts` — both are already ignored
      (`void asContext; // visibility filtering wired in Phase 5`), so no behavior changes.
- [x] 2.4 `src/commands/graph-query.ts`: drop the `filterGraphByAudience` import and call.
      `src/core/errors.ts`: drop `check.audience_required` and `publish.audience_required` and their
      error classes.
- [x] 2.5 Verify: `npm run build` exits 0, and `node dist/bin.js --help` lists neither `check` nor `note`.

## 3. Strip the publish gate

- [x] 3.1 `src/commands/publish-gather.ts`: drop the `as` selector, the `audience` flag, per-note verdicts,
      the leak scan, and the aggregate verdict; `PublishGatherData` keeps `selector`, `subject`, `count`,
      and `notes`; the command exits `ExitCode.Ok` on a successful enumeration.
- [x] 3.2 `src/commands/publish-check.ts`: drop the visibility-field assertion from the sibling-README
      frontmatter check, keeping the `kind` assertion.
- [x] 3.3 Leave `ExitCode.DisclosureDeny` and `ExitCode.DisclosureAsk` in `src/core/exit-codes.ts`,
      reserved and unused, with their comments updated to say so (design.md D4).
- [x] 3.4 Verify: against a temp store, `node dist/bin.js publish gather --under <prefix> --json` exits 0
      and its JSON carries no `verdict` key.

## 4. Config schema and defaults

- [x] 4.1 `src/config/schema.ts`: drop `VisibilitySchema`, `DisclosureSchema`, `HardWallSchema`, the
      `visibility`/`disclosure` fields of `StoreConfigSchema`, the `HardWallConfig` export, and
      `FieldsSchema.visibility`. Decide and record whether `fields` survives with no required key or is
      dropped entirely — it is `.passthrough()` today and has no other member.
- [x] 4.2 `src/config/defaults.ts`: drop `DEFAULT_VISIBILITY_FIELD_KEY`,
      `SCHEMA_V1_VISIBILITY_FIELD_KEY`, `DEFAULT_VISIBILITY_CONTEXT`, `DEFAULT_INTERNAL_AUDIENCES`, and
      `DEFAULT_HARD_WALLS`.
- [x] 4.3 `src/commands/init.ts`: stop writing the two config blocks. `src/commands/session-capture.ts`:
      stop stamping the visibility field. `src/core/records.ts`: drop `visibility` from `PerNoteRecord`.
- [x] 4.4 Raise `SUPPORTED_SCHEMA_VERSION` to 7, with a comment recording why, in the same style as the
      existing per-version notes.
- [x] 4.5 Verify: `node dist/bin.js init` in a temp dir produces a `contexture.yaml` with no `visibility:`
      block, no `disclosure:` block, and no `fields.visibility`; `node dist/bin.js doctor` exits 0.

## 5. Migration

- [x] 5.1 Add `src/core/migrations/drop-access-axes.ts`, keyed `fromVersion: 6`, following the registry's
      `<verb>-<noun>.ts` naming (not the `NNNN-` prefix `separate-scope-and-name-the-axes` assumed).
      It removes `visibility:`, `disclosure:`, and `fields.visibility` from `contexture.yaml` and
      rewrites no note (design.md D3). Register it in `src/core/migrations/registry.ts`.
- [x] 5.2 Verify: on a schema-6 fixture store, `node dist/bin.js migrate --dry-run --json` names exactly
      this migration, then `node dist/bin.js migrate` exits 0, then `node dist/bin.js doctor` exits 0, and
      a note that carried the visibility field still carries it byte-identically.

- [x] 5.3 Retire `src/core/migrations/rename-visibility-field.ts` and its registry entry (design.md D7):
      its only work was renaming the visibility frontmatter key, and it rewrote every note to do it.
      Record the now-intentional gap in the version chain in `registry.ts`.
- [x] 5.4 Verify: a schema-1 fixture store migrates cleanly to the current version with no note rewritten,
      and `ctxr doctor` exits 0 afterwards.

## 6. Shipped prose

- [x] 6.1 Update the templates: `templates/agents/canonical.md` (the frontmatter field list),
      `templates/conventions/baseline-conventions.md` (the four-rung ladder and the two-independent-axes
      paragraph), `templates/skills/ctxr-publish.md`, `templates/skills/ctxr-organize-audit.md`,
      `templates/skills/ctxr-placement.md`, `templates/skills/ctxr-session-capture.md`.
- [x] 6.2 `src/core/convention-doc.ts`: drop the hard-wall and internal-audience rendering.
      `src/core/agents-doc.ts`: drop the visibility prose. `src/core/skills.ts`: fix the three skill
      descriptions naming visibility or disclosure. Shipped prose stays in `templates/*.md`; only
      descriptions and rendering logic live in TypeScript.
- [x] 6.3 Update the comment-only references in `src/adapters/types.ts`, `src/commands/archive.ts`,
      `src/core/checks/types.ts`, `src/core/checks/organize-checks.ts`, and `src/core/ingest/identity.ts`.
- [x] 6.4 Verify: in a temp store, `node dist/bin.js update` then `node dist/bin.js doctor` exits 0, and
      `grep -rin "visibilit\|disclosur\|audience" templates/ AGENTS.md` returns nothing in the generated
      store's entry document.

## 7. Specs and the project document

- [x] 7.1 Delete `openspec/specs/context-visibility/` and `openspec/specs/disclosure-policy/` (a capability
      with zero requirements is not a valid spec state), and apply this change's deltas to the other eight.
- [x] 7.2 Rewrite `openspec/config.yaml`: the Tenancy paragraph, the "Naming is deliberately postponed"
      paragraph, the three visibility-field-key authoring rules under `rules.specs`, and the
      archive-time literal-key audit under `operations.archive.guidance` — all describe removed machinery.
- [x] 7.3 Retire the three dependent changes per design.md D6: `separate-scope-and-name-the-axes`,
      `rollup-respects-visibility`, `isolation-and-egress`.
- [x] 7.4 Reconcile `compose-store-guidance-documents`: its `store-integrity` delta MODIFIES the `doctor`
      requirement this change removes and replaces, and names the deleted visibility check in its list.
      It is already invalid independently of this change (it omits two scenarios), so rebase its delta
      onto the requirement's new name and drop the visibility check while fixing that. Do not retire it —
      only this one requirement overlaps. See design.md Risks.
- [x] 7.5 Verify: `openspec validate --all --strict` exits 0, and
      `grep -rn "context-visibility\|disclosure-policy" openspec/specs/ openspec/config.yaml` returns
      nothing.

## 8. Verify the whole

- [x] 8.1 Delete the axis-specific suites: `test/unit/visibility.test.ts`,
      `test/unit/disclosure-model.test.ts`, `test/unit/leak-scan.test.ts`,
      `test/unit/graph-visibility-filter.test.ts`, `test/unit/check-command.test.ts`,
      `test/unit/note-resolve-command.test.ts`, `test/unit/disclosure-checks.test.ts`,
      `test/integration/disclosure.test.ts`, `test/integration/note-resolve.test.ts`.
- [x] 8.2 Trim the `visibility: {...}` / `disclosure: {...}` config literals from the remaining suites and
      fixtures, and drop the visibility-key assertion (with its anti-vacuity case) from
      `test/unit/single-source-literals.test.ts`.
- [x] 8.3 Add a regression test proving design.md D3: a note carrying the retired visibility key is
      byte-identical after `ctxr migrate`, and every retrieval leg returns it.
- [x] 8.4 Verify: `npm run build`, `npm run typecheck`, and `npx vitest run` each exit 0; then on a fresh
      temp store `node dist/bin.js init && node dist/bin.js doctor && node dist/bin.js verify --portable`
      each exit 0.
