Parked, not implemented. Implementation is a separate, separately-requested pass.

## 1. What the installed version ships, for a path

- [ ] 1.1 `src/core/skills.ts`: add a function that, given the config, returns a map of every path under the
      configured skills path to the content the installed version writes there: each owned skill's
      `SKILL.md` (from `renderSkills`), each owned skill's supporting files, and the packaged files of each
      vendored skill the config declares (the vendored payload reader, minus `provenance.json`). Paths are
      store-relative and posix, the same spelling `skillPaths` and the staged paths use.
- [ ] 1.2 Unit tests beside the existing skills tests: the map covers every path `skillPaths(config)` lists,
      includes a declared vendored skill's packaged files, omits an undeclared one, and omits the
      `.ctxr-vendored.json` record. Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'`.

## 2. The ceiling

- [ ] 2.1 `src/core/checks/write-lifecycle-checks.ts`: in `stagedDiffSizeCeilingCheck`, skip a staged file whose
      status is not `D`, whose `content` is defined, and whose content equals the map's entry for its path;
      sum the rest as today. Track the skipped total.
- [ ] 2.2 Put the skipped total in the failure message and in the finding's `details`, so a refusal states
      what was left out (design D5). A pass carries no new output.
- [ ] 2.3 The check's first direct tests, in a new `test/unit/staged-diff-ceiling.test.ts`, one per spec
      scenario: shipped skill files over the ceiling pass; a one-byte edit counts in full; an unshipped file
      inside an owned skill's directory counts; shipped bytes at an unshipped path count; a deletion counts;
      other lines still trip the ceiling and the message names the amount left out; a file with no staged
      content (over 2 MB) counts. Verify: `npx vitest run test/unit/staged-diff-ceiling.test.ts
      --exclude '**/.claude/**'`.

## 3. End to end

- [ ] 3.1 With PR #124 (`ctxr-second-opinion`) stacked on this change: a fresh `ctxr init` exits 0 and its
      first commit lands. Verify: `npx vitest run test/integration --exclude '**/.claude/**'` is fully green,
      including `session-lifecycle`, `init-idempotent` and `verify-portable`, which fail today for this reason.
- [ ] 3.2 In a scratch store, `ctxr init`, then `git diff --cached --numstat` on the staged set before the
      commit, and confirm the counted total is about 520 and the left-out total is about 2,137.
- [ ] 3.3 Confirm an agent-sized edit is still refused: stage 2,100 lines of a new operator-authored skill under
      the skills path and confirm the commit is refused naming the ceiling.

## 4. Full verification

- [ ] 4.1 `npm run typecheck && npm run build`.
- [ ] 4.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'`, both green.
- [ ] 4.3 `openspec validate exempt-shipped-skill-files-from-the-diff-ceiling --strict` and
      `openspec validate --specs` clean.
- [ ] 4.4 Mark the ceiling Risk resolved in `ship-a-cross-model-second-opinion-skill`'s design.md and
      unblock its tasks 4.3 to 4.6, if that change is not yet archived.
