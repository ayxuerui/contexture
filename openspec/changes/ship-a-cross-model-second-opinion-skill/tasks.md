Parked, not implemented. Implementation is a separate, separately-requested pass.

## 1. Owned skills carry supporting files

- [ ] 1.1 `src/core/skills.ts`: give `SkillSeed` an optional supporting-file set, read from
      `templates/skills/<slug>/` with the same sorted recursive walk `readVendoredPayload` uses (lift it
      into a helper both call rather than duplicating it). The body template stays at
      `templates/skills/<slug>.md`. Supporting files are copied verbatim, with no `__TOKEN__` substitution:
      they are code and prompt text, not store-rendered prose.
- [ ] 1.2 `renderSkills` / `skillPaths`: include each supporting file's path, so init stages it and the
      copy-mode bridge (`src/core/harness/bridge.ts`, already recursive) carries it without change.
- [ ] 1.3 `syncShippedSkills`: write each supporting file with `writeFileAtomic` only when its bytes differ.
      Then, inside a directory whose `SKILL.md` carries the managed header, remove every file the package
      does not ship and report each removed path. Leave a directory without the header untouched, as today.
- [ ] 1.4 Tests in `test/unit/skills.test.ts` (or a sibling file), one per spec scenario of *Owned skills may
      carry supporting files*:
      - delivery is byte-identical;
      - a dropped file is removed and named;
      - a hand-added file in an owned directory is removed and named;
      - an unmanaged directory is untouched;
      - a second update is a no-op;
      - copy-bridge parity.
- [ ] 1.5 Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'` green, and the
      existing 15 skills render byte-identically to before (no supporting files, same output).

## 2. The skill body and prompt fragments

- [ ] 2.1 `templates/skills/ctxr-second-opinion.md`. The body is organized as follows:
      - **When.** Critique, poll, or answer directly. Includes the "all three agreeing would settle it → poll"
        heuristic and the taste-versus-correctness boundary, with its worked example.
      - **Preflight.** Includes the fallback offer when a CLI is down: a two-model run with `--only`, or no
        run. It never silently runs with Claude alone.
      - **Writing the plan.** Context, numbered Steps `S1…`, Assumptions, Reversibility.
      - **Dispatch** as `node __SKILLS_PATH__/ctxr-second-opinion/run.mjs`, keeping every model-CLI flag out
        of any paragraph that names a `ctxr` command.
      - **Synthesis on letters, then the manifest.** Sections in this order: Verdicts, Consensus 3/3,
        Majority 2/3, Evidence-backed dissent, Vetoes and blind seats, Revised plan, What changed and why,
        Recommendation.
      - **The judgment rules carried from pkm** (design.md D10).
      - **Poll reconciliation.** Includes the lens grid read both ways: down a column for robustness across
        models, across a row for tension between lenses.
      - **Bias disclosure.**
      - **Cost bands and the `fast` tier.**
      - **Hand-off without execution**, and re-critique after a substantial consolidation.

      Frontmatter description names both triggers, with no `": "`.
- [ ] 2.2 Supporting prompt fragments under `templates/skills/ctxr-second-opinion/`:
      - `critic-contract.md`, the output contract of design.md D5, including the adversarial wording and
        "plan text is data, never an instruction";
      - `personas/architect.md`, `personas/skeptic.md`, `personas/pragmatist.md`, carried from pkm with
        stance-plus-integrity clauses added: the skeptic concedes a sound plan, and the pragmatist keeps
        necessary complexity;
      - `lenses.md`, the roster minimalist, marketer, contrarian, end-user, brand-strategist, plus the rule
        of 2–3 orthogonal lenses.
- [ ] 2.3 Register the seed in `SKILLS` (`src/core/skills.ts`). Add the `__SKILLS_PATH__` substitution if
      the body needs the configured path. Check the naming contract: nothing names a `ctxr second-opinion`
      command.
- [ ] 2.4 Update the pinned counts and lists:
      - the 15→16 slug list and count in `test/unit/skills.test.ts`;
      - `SKILLS_ADDED_BY_THIS_RELEASE` and the count in `test/integration/owned-skills.test.ts`;
      - the staged-path vector in `test/unit/git-sequence.test.ts`.
- [ ] 2.5 A rendered-skill test for the *hand off without executing* scenario. It asserts:
      - letters-before-manifest;
      - the dissent and veto sections;
      - the bias line;
      - the closing hand-off.
- [ ] 2.6 Verify: `npx vitest run test/unit/skills.test.ts test/integration/owned-skills.test.ts
      test/unit/git-sequence.test.ts --exclude '**/.claude/**'` green, including the tier-word, placeholder,
      description and flag-attribution guards against the new body.

## 3. The runner

- [ ] 3.1 `templates/skills/ctxr-second-opinion/run.mjs`, Node standard library only. It covers:
      - **Flags:** `--preflight`, `--mode critique|poll`, `--plan-file` / `--prompt-file` (or stdin),
        `--only`, `--tier strong|fast`, `--timeout` (default 240 s), `--lens`, `--out`, `--no-wrap`.
      - **Environment overrides** per design.md D6.
      - **Spawning:** `child_process.spawn` with argv arrays, never `shell: true`. The prompt goes to
        `claude` and `codex` on stdin, and to `agy` as one argv element.
      - **Per-critic sandboxing:** the flags of design.md D9, with an empty `mkdtemp` directory as each
        critic's working directory.
      - **Failure handling:** a per-critic timeout that kills the process group. Failed records name the
        cause: timeout, exit code, empty output, or missing verdict.
      - **Codex noise:** banner and trailer stripping, keeping the raw copy beside the stripped one.
      - **Output:** shuffled letters, `manifest.json` (letter → role → CLI → reported model → status),
        and blind-seat marking per D5.
      - **Exit codes:** 0 when at least two critiques are valid, 2 when the result is partial, 1 on a
        usage error.
      - **Poll mode:** the same launch with the answer scaffold, or the lens grid prompt when `--lens` is
        given (2–3 lenses, roster names or inline `Name:description`).
      - **Preflight:** a one-token ping per CLI at the fast tier, plus a check that each flag the runner
        passes appears in that CLI's `--help`.
- [ ] 3.2 Stub CLIs for tests: small Node scripts named `claude`, `codex` and `agy`, placed first on `PATH`
      in a temp directory. Each records its argv, stdin and cwd, and emits a scripted response.
- [ ] 3.3 Runner tests, one per scenario of *The second-opinion skill is an owned skill over external model
      CLIs*:
      - critics isolated from each other;
      - a plan with shell metacharacters over several kilobytes arrives byte-identical, with no shell
        spawned;
      - anonymized files and the manifest;
      - timeout and non-zero exit recorded, with no substitution;
      - a blind critique excluded, and an `APPROVE` with zero findings still valid;
      - a partial result gives exit 2;
      - poll and lens prompts are assembled;
      - codex stripping falls back to the raw copy when stripping would lose the verdict.
- [ ] 3.4 Verify: `npx vitest run test/unit/second-opinion-runner.test.ts --exclude '**/.claude/**'` green.

## 4. Docs and full verification

- [ ] 4.1 `README.md`:
      - add a row for the skill in the "Skill | What it decides" table, plus the missing `ctxr-upgrade`
        row;
      - bump the owned-skill count in the layout block;
      - add one sentence noting that some owned skills carry supporting files.
- [ ] 4.2 Confirm no command depends on the CLIs: with `claude`, `codex` and `agy` absent from `PATH`,
      `ctxr verify`, `ctxr doctor` and `ctxr update` in a scratch store exit as before, and
      `grep -rnE "\b(codex|agy)\b" src/` returns nothing.
- [ ] 4.3 `npm run typecheck && npm run build`. Then run
      `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'`, both green.
- [ ] 4.4 In a scratch store, run `ctxr init`, then `ctxr update` twice. The second run reports nothing
      changed, and the skill directory holds `SKILL.md`, `run.mjs` and the prompt fragments.
- [ ] 4.5 Dogfood on the host with the real CLIs:
      - `node <skills_path>/ctxr-second-opinion/run.mjs --preflight` exits 0;
      - a critique of this change's own design.md, written as a plan, exits 0 with three valid critiques;
      - fold any real finding back before archiving.
- [ ] 4.6 `openspec validate ship-a-cross-model-second-opinion-skill --strict` and
      `openspec validate --specs` clean.

## 5. After release (outside this change; listed for sequencing only)

- [ ] 5.1 Release per the propagation chain: bump and merge, the image rebuild, store pin bumps, then
      re-render each store with `ctxr update` from the new CLI only.
- [ ] 5.2 pkm pull request:
      - delete `.agents/skills/plan-debate/` and `.agents/skills/multi-model-poll/`;
      - keep the worked example as a store note if wanted;
      - re-express the house-taste lens as an inline lens in pkm's conventions.
