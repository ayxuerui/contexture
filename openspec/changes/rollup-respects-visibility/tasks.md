Parked, not implemented — this change is the record of a leak found by audit. Implementation is a separate,
separately-requested pass.

## 1. Audit the enumerations first

- [ ] 1.1 Enumerate every caller of `listNotes` in `src/` and record, per caller, whether it enumerates on
      behalf of a requesting context (supplied or derived). The broadened requirement implicates any that
      do; this list is the evidence that only `rollup gather` is affected — or the discovery that it isn't.
- [ ] 1.2 Read `ctxr rollup stale` and `ctxr publish gather --entity`, which share the backlink enumeration,
      and record the conclusion for each: `publish gather` is covered by a stronger per-note disclosure
      gate, and `rollup stale` compares timestamps without surfacing content. Record it in the change
      rather than assuming it.
- [ ] 1.3 Verify: `grep -rn "listNotes(" src/ | wc -l` matches the number of callers accounted for above.

## 2. Filter the gather

- [ ] 2.1 `src/commands/rollup-gather.ts`: resolve the entity note's own visibility, then filter the
      backlink set with `canSee` before returning it — reusing `resolveVisibility`/`canSee` from
      `src/core/notes/visibility.ts`, composed the same way `src/commands/publish-gather.ts` already does
      for its `--as` selector. Return an empty set when the entity's visibility does not resolve.
- [ ] 2.2 Make the exclusion visible in the command's own output, so a source silently dropping out is
      legible to whoever runs it rather than an unexplained smaller count.
- [ ] 2.3 `test/unit/rollup-command.test.ts`: a source outside the entity's visibility is absent from the
      gathered set; one inside it is present; an entity whose visibility does not resolve gathers nothing.
- [ ] 2.4 Verify: `npx vitest run test/unit/rollup-command.test.ts --exclude '**/.claude/**'`.

## 3. Full verification

- [ ] 3.1 `npm run typecheck && npm run build`.
- [ ] 3.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [ ] 3.3 `openspec validate rollup-respects-visibility --strict` and `openspec validate --specs` clean.
- [ ] 3.4 In a scratch store: an entity visible to one context, a backlinking note visible only to another,
      and `rollup gather` returns the entity's own sources and not the other — the leak this change exists
      to close, demonstrated end to end rather than only unit-tested.
