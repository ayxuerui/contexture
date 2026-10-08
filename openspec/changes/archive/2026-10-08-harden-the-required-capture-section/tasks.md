## 1. What counts as a section

- [x] 1.1 `src/core/ingest/required-sections.ts`: replace the heading set with a pass that tracks fenced code
      blocks (open on three or more backticks or tildes, close on the same character at least as long) and
      records headings only outside them, with their level and the lines under each. Keep matching case-sensitive
      and level-agnostic for the *name*; use the level only to find where a section ends.
- [x] 1.2 `missingRequiredSection` returns the declared name when the heading is absent, fenced-only, or has no
      non-blank non-heading line before the next heading of the same or shallower level or end of file.
- [x] 1.3 Tests, one per new scenario plus the edges: empty heading; heading followed only by a deeper empty
      heading; heading only inside a fence; real heading plus a fenced duplicate; unclosed fence; tilde fence;
      content inside a code block under a real heading counts; the five existing scenarios still pass unchanged.
      Done in `test/unit/required-sections.test.ts` (24 cases), with the ingest and lint scenarios in
      `ingest-command.test.ts` and `lint-command.test.ts`. An empty code block, an info string, an unclosed
      fence, a shorter fence not closing a longer one, and CRLF are all pinned.

## 2. The source type the declaration is looked up under

- [x] 2.1 `src/commands/ingest.ts`: before the required-section check, read the capture's own `source-type`.
      If it is present and differs from `flags.sourceType`, throw an error carrying both, exit code the check
      exit code, before anything is stamped or moved. If it is absent or equal, proceed as today.
- [x] 2.2 Tests: disagreement refused naming both and writing nothing (inbox file untouched, no stamp, note and
      artifacts unchanged); agreement checked under the type; absent takes the invocation's; the refusal happens
      before the section check.

## 3. Guidance

- [x] 3.1 `templates/agents/capture-and-ingest.md` and `templates/skills/ctxr-capture.md`: say the section must
      carry something under it, and that the capture's own source type and the invocation's must agree. Respect the
      tier-word and flag-attribution guards in `test/unit/skills.test.ts`.

## 4. Mutation checks and end to end

- [x] 4.1 Mutation checks, as #97 did: disable the empty-section rule and confirm exactly its tests fail; disable
      the fence handling and confirm exactly its tests fail; disable the type refusal and confirm exactly its
      tests fail. A guard nobody has seen fail is not a guard.
- [x] 4.2 Scratch store with `circleback: Transcript` declared: the five cases from the proposal now give refused,
      refused, refused, accepted, refused (exit 3 for each refusal), plus an agreeing capture accepted; `ctxr lint` reports inbox captures that carry their own type and lack the
      section, and still exits zero (a capture whose type is only on the command line is outside lint's view,
      design D4); a store declaring nothing ingests byte-for-byte as before.

## 5. Full verification

- [x] 5.1 `npm run typecheck && npm run build`, `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` green.
- [x] 5.2 `openspec validate harden-the-required-capture-section --strict` and `openspec validate --specs` clean.
- [ ] 5.3 After release: pkm's declared `circleback: Transcript` needs no change. Check that the Circleback
      captures the stack writes carry a non-empty `Transcript` and a matching `source-type`.
