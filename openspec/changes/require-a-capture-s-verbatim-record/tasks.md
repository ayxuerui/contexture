## 1. The declaration

- [x] 1.1 `src/config/schema.ts`: add an optional `required_capture_sections` map to `IngestSchema` — source
      type to required section heading, both non-empty strings. Schema-optional with NO default and no
      `.default({})` (D7): `readConfig` parses strictly, and `IngestSchema` is already prefaulted on
      `StoreConfigSchema`, so a `contexture.yaml` predating this key parses unchanged. Refuse an empty map —
      declaring nothing and declaring an empty mechanism are different statements, and only one of them is
      spelled by omitting the key.
- [x] 1.2 Confirm nothing lands in `src/config/defaults.ts`: the key has no shipped default, so
      `SHIPPED_DEFAULTS.ingest` gains nothing and the single-source-literals guard over schema defaults stays
      satisfied without an exemption.
- [x] 1.3 Confirm `ctxr init` writes nothing for the key and adds no prompt (proposal Non-goals), and that
      `renderStoreConfig` round-trips a declared value — `withoutShippedDefaults` keeps keys absent from
      `SHIPPED_DEFAULTS` verbatim, so this is an assertion, not a change.
- [x] 1.4 `test/unit/config-schema.test.ts`: a config omitting the key parses with it `undefined`; one entry
      parses; two entries parse; an empty map is refused naming the key; an entry with an empty heading is
      refused.
- [x] 1.5 Verify the guard is real. Dropping `.optional()` does NOT reach the test suite — it fails the BUILD
      first, at `src/commands/init.ts(323,5) error TS2741: Property 'required_capture_sections' is missing`,
      and replacing it with `.default({...})` fails identically. That is a stronger guard than the one this
      task anticipated: the key cannot be made non-optional at all while `init` still compiles. The runtime
      refinement was mutated separately to confirm it also has teeth — disabling it
      (`.refine(() => true, ...)`) fails exactly one test, "refuses an empty map", with
      `AssertionError: promise resolved ... instead of rejecting`. Both restored.
- [x] 1.6 `npx vitest run test/unit/config-schema.test.ts test/unit/single-source-literals.test.ts --exclude '**/.claude/**'`
      — green.

## 2. The refusal

- [x] 2.1 `src/core/ingest/required-sections.ts` (new): `hasNonEmptySection(body, heading)` — a level-2
      heading whose trimmed text matches the declared heading without regard to case, with at least one
      non-blank line before the next heading at the same or a shallower level (D4). This file is the only
      place the matching rule lives, so a second reader cannot drift from it.
- [x] 2.2 `src/core/errors.ts`: one error class beside `AlreadyIngestedError`, at `ExitCode.Usage`, its
      message naming the capture and the heading it looked for and naming no expected content — the delta's
      "names what is missing, not what it should contain" scenario is an assertion on this string.
- [x] 2.3 `src/commands/ingest.ts`: after `readOrThrow(capture)` and beside the existing `hasAssignedIdentity`
      refusal — so it fires before any write — throw when the effective source type has an entry in the map
      and `hasNonEmptySection` is false. The effective type is the `--source-type` flag OR the capture's
      existing `source_type`; if either names a declared type, the gate applies (D3).
- [x] 2.4 `test/unit/ingest-command.test.ts`: refused with no section (non-zero, capture still in the inbox,
      unstamped, note's `sources` untouched, catalog not rebuilt); refused with the heading present but
      empty; accepted with content; refused when the type arrives via frontmatter while `--source-type` names
      an undeclared one; a second declared type also gated; a store declaring nothing ungated under any type;
      a non-markdown capture checked via its sidecar.
- [x] 2.5 Verified the guard is real. With the refusal disabled, exactly the six refusal cases fail and the
      twenty-four others still pass (`Tests  6 failed | 24 passed (30)`): "refuses it, writing nothing at
      all", "names the capture and the section, and no completeness standard", "refuses a heading with
      nothing under it...", "refuses when the declared type sits in frontmatter and the invocation names
      another", "gates every declared type...", and "checks the sidecar for a capture that is not markdown".
      Restored via `cp` from `/tmp`, never `git stash` — the stash stack is shared with every other worktree
      on this machine.
- [x] 2.6 `npx vitest run test/unit/ingest-command.test.ts test/unit/ingest-identity.test.ts test/integration/ingest.test.ts --exclude '**/.claude/**'`
      — green.

## 3. The guidance

- [x] 3.1 `templates/agents/capture-and-ingest.md`: state the principle — a capture stands as provenance only
      if it carries the record it rests on, and a source's own summary is a derivation of that record, not a
      substitute for it — then a `__REQUIRED_SECTIONS__` token on a line of its own.
- [x] 3.2 `src/core/agents-doc.ts`: wrap `renderCaptureSection`'s existing `.replaceAll` chain in
      `substituteBlock`. Its empty-list behavior removes the token line entirely, so an undeclared store
      renders byte-identically to today — no stray blank line, no empty heading.
- [x] 3.3 `test/unit/agents-doc.test.ts`: a declaring store names its source type and section; a two-entry
      store names both in a stable order regardless of declaration order; a non-declaring store carries no
      trace of the mechanism. NOTE: the original wording of this task ("renders exactly the bytes it renders
      today") was wrong and was corrected in the delta spec — the principle is new prose every store
      receives, so the section cannot be byte-identical to the previous release. The property that IS true is
      that an undeclared store gets no dangling heading and no extra blank line, and the existing
      `exact rendered output` test already asserts the whole section line by line, so it is the byte guard.
- [x] 3.4 Verified the byte guard is real. With `substituteBlock`'s empty case emitting a blank line instead
      of removing the token's line, five tests fail (`Tests  5 failed | 48 passed (53)`): the two
      `templates.test.ts` placeholder cases, the existing `renders the capture section` exact-output
      assertion, `renders the canonical section with no mission configured`, and the new
      `leaves no trace of the mechanism when nothing is declared`. Restored.
- [x] 3.5 `npx vitest run test/unit/agents-doc.test.ts test/unit/templates.test.ts --exclude '**/.claude/**'`
      — green.

## 4. Full verification

- [x] 4.1 `npm run typecheck && npm run build` — both clean.
- [x] 4.2 `npx vitest run test/unit` 918 passed (78 files); `npx vitest run test/integration` 106 passed
      (25 files). Both green.
- [x] 4.3 `openspec validate require-a-capture-s-verbatim-record --strict` — valid. `openspec validate
      --specs` — `Totals: 14 passed, 0 failed`.
- [x] 4.4 `ctxr --help` lists no new command. `grep -rn required_capture_sections src/` shows exactly three
      hits: the schema, the ingest guard, and the guidance renderer — the declaration plus its two readers.
- [x] 4.5 No vocabulary leaked. No vendor name appears in `src/` or `templates/` from this change; the one
      `granola/abc123` hit in `core/ingest/canonical-url.ts` is pre-existing (commit f27b517) and untouched.
      The delta spec uses `source-a`/`section-b` placeholders only. "transcript" survives solely as an
      illustrative word in doc comments and one line of principle prose — no code branches on it and no
      requirement depends on it.
- [x] 4.6 End-to-end in `/tmp/vr-store`. Refused under the first declared type: `error: "raw/inbox/a.md"
      carries no non-empty "section-a" section...` exit 2, capture still in the inbox with no `source_hash`,
      note's `sources` untouched. Refused under the second declared type naming its own heading
      (`"Testimony"`), proving the map is per-type. An undeclared type ingested normally. After appending the
      section, the same ingest exited 0, retained to `raw/202609/b.md` with all four fields stamped, and the
      note cited it. `ctxr lint` reported `organize.uningested_inbox_material` and exited 0; `ctxr doctor`
      exited 0 — a refused capture is not an invariant violation.
- [x] 4.7 Byte-stability confirmed at all three declaration states. With two, one, and zero entries, the
      first `ctxr update` reported `changed: ['AGENTS.md']` and the second `changed: []`. At zero entries
      AGENTS.md contains no `This store requires` block and exactly one blank line after the principle.
- [x] 4.8 Generality holds. `deposition: Testimony` — a pair with no connection to the source kind that
      prompted this change — gated identically, refusing with its own heading name. The abstraction leaked no
      assumption about what kind of source a capture came from.
## 5. The manual

Not foreseen when this list was written. README's "1. Capture" section documents the identity contract,
`source check`, and `ingest` — a new refusal a reader will hit belongs beside them, or the key is
discoverable only by reading a generated AGENTS.md section.

- [x] 5.1 `README.md`, "1. Capture — get material in without duplicating it": the principle, the
      `ingest.required_capture_sections` shape, what `ctxr ingest` refuses, that both words belong to the
      store, and that the check is shape only — stated there too, so the manual does not imply a stronger
      guarantee than the requirement offers.
- [x] 5.2 `npx vitest run test/unit --exclude '**/.claude/**'` — 918 passed, unaffected.
