## 1. Opt-in owned skills

- [x] 1.1 `circleback` block in `src/config/schema.ts` (`tag`; optional `other_tags`, `decline_tag`), and
  `DEFAULT_CIRCLEBACK_DECLINE_TAG` in `src/config/defaults.ts`.
- [x] 1.2 `SkillSeed.enabled`, config-aware `supportingFiles`, `OPTIONAL_SKILLS` and `activeSkillSeeds` in
  `src/core/skills.ts`; render, sync and `shippedSkillFiles` use the active set.

## 2. The Circleback skill

- [x] 2.1 `templates/skills/ctxr-circleback.md` and the `CIRCLEBACK` seed, rendering `settings.json`.
- [x] 2.2 `templates/skills/ctxr-circleback/sweep.mjs`: tags read from `cb meetings read`, presence against the
  default branch and open pull requests, a fixed self-clearing worktree, rendered captures, and the report.
- [x] 2.3 README: the opt-in skill table and the `circleback` block.

## 3. Verification

- [x] 3.1 Unit tests: opt-in rendering, rendered settings, the runner's stdlib-only imports, removal on opt-out, and
  the existing content guards over the opt-in skill. Schema tests: the block is optional, adds no unwritten key, and
  needs `tag`.
- [x] 3.2 Integration test: the runner against a git store with stand-in `cb` and `gh`.
- [x] 3.3 Run `npm run typecheck && npm test` and `openspec validate circleback-sweep --strict`, and confirm both exit 0.

## 4. Rollout (after release, outside this repository)

- [ ] 4.1 pkm and readyrun-brain declare a `circleback` block; `ctxr update` renders the skill.
- [ ] 4.2 contexture-images copies the skill into `/opt/data/scripts` at start, with a launcher that `cd`s into the
  store and runs the runner by absolute path.
- [ ] 4.3 Each store's Hermes job uses the launcher and the skill; the hand-copied Python script and old jobs are
  removed.
