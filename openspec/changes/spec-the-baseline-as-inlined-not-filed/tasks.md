## 1. Confirm the shipped behavior matches the ADDED requirement

- [ ] 1.1 Install dependencies and run the baseline suite: `npm ci && npx vitest run test/unit/conventions.test.ts`
      — green, including every test under "the baseline renders into AGENTS.md instead of a file"
      (first block sourced to the tool, ahead of operator files, managed copy removed under either name,
      operator file at either name kept, no-op when nothing to remove, tracks the store config).
- [ ] 1.2 End-to-end on a scratch store: `npm run build`, then `node dist/bin.js init --root <scratch>
      --profile para --no-input` followed by `ls <scratch>/.contexture/guidance/` — no baseline file —
      and `grep -c "contexture's shipped baseline, rendered from this store's configuration"
      <scratch>/AGENTS.md` prints `1`.
- [ ] 1.3 Same scratch store: change `git.default_branch` in `contexture.yaml`, run `node dist/bin.js
      doctor --root <scratch>` — exits non-zero with a `harness_portability.agents_md_convention_drifted`
      finding naming the shipped baseline, not the guidance directory — then `node dist/bin.js update
      --root <scratch>` twice; the second run reports no change, and a further `doctor` run carries no
      `agents_md_convention_drifted` finding.

## 2. Validate and sync the spec

- [ ] 2.1 `openspec validate spec-the-baseline-as-inlined-not-filed --strict` passes.
- [ ] 2.2 After archive (or `openspec-sync-specs`), `grep -n "delivered into the guidance directory"
      openspec/specs/harness-portability/spec.md` prints nothing, and `grep -n "rendered into the entry
      document, not delivered as a file" openspec/specs/harness-portability/spec.md` prints one line.
- [ ] 2.3 `grep -rn "SHALL carry a contexture-owned baseline convention file\|baseline-conventions.md"
      openspec/specs/` prints nothing, and `openspec validate --specs --strict` passes.

## 3. Correct the prose that still describes a baseline file

- [ ] 3.1 Reword the comments that describe a baseline file — `src/config/defaults.ts` (guidance-path
      and both filename-constant comments), `src/config/schema.ts` (guidance-documents comment),
      `src/core/conventions.ts` (`scanConventions`), `src/core/reconcile.ts` (the ordering comment
      before `removeManagedBaselineFile`) — and point `templates/skills/ctxr-session-capture.md`'s
      "read that file first" at the first block of `AGENTS.md`'s "Store conventions" section.
- [ ] 3.2 `grep -rn "baseline convention file\|syncBaselineConventions\|read that file first" src
      templates` prints nothing; `npm run typecheck` and `npx vitest run` pass.
