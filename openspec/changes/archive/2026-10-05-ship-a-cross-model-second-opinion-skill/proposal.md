## Why

Before an agent executes a plan it cannot cheaply undo, or settles a question where its own taste is one vote
among several, the most useful check available is a critique from a model that was not trained on the same
distribution as the agent. One store (pkm) has worked this out the hard way, as two sibling skills —
`plan-debate` (three critic personas on three model families, synthesized into a revised plan) and
`multi-model-poll` (the same three families as a cheap convergence check). Both carry months of accreted
lessons: prompt passed on stdin and never through a shell, per-critic timeouts, codex banner stripping, the
`agy` empty-prompt bug on multi-kilobyte stdin, and a body of synthesis judgment (blast-radius tiebreaks,
"2/3 agree on the diagnosis is not agreement on the fix", folding results as an authoritative deltas block).

None of that reaches any other store. readyrun-brain runs the same harness image with the same three CLIs
installed and has neither skill. The two runners have also drifted from each other inside pkm (different
timeouts, different noise stripping, `--sandbox` passed to `agy` by one and not the other). And a survey of
comparable open-source skills and the multi-agent-debate literature (see design.md) shows several
improvements neither pkm skill has: anonymizing critiques before the orchestrator synthesizes them, a
validated output contract with evidence citations, detecting a critic that answered without reading the
plan, and a quorum rule that refuses to report a consensus that did not happen.

Contexture already exists to put one reviewed copy of a skill into every store and keep it current. This
is that, plus the one mechanism the skill needs that owned skills cannot yet do: ship a runner script
beside the `SKILL.md`.

## What Changes

- **Owned skills may carry supporting files.** An owned skill's directory may hold packaged files beside
  its `SKILL.md` — scripts, prompt fragments — written byte-identical by `ctxr init` and `ctxr update`,
  removed by update when the package stops shipping them, and managed by virtue of the `SKILL.md` carrying
  the managed header. Today every owned skill is exactly one file.
- **A new owned skill, `ctxr-second-opinion`**, replacing pkm's two with one skill in two modes:
  - *critique* — a plan goes to three critics (architect, skeptic, pragmatist) each backed by a different
    model family's CLI, run in parallel, isolated from one another, read-only where the CLI offers it and in
    an empty working directory where it does not. Results come back under shuffled letters; the agent
    synthesizes on the letters, reveals the model mapping last, surfaces vetoes and critics that answered
    blind, and hands a revised plan back without executing anything.
  - *poll* — one question to the same three families, as a convergence check, with an optional grid of two
    or three taste lenses per model.
- **The runner ships with the skill** as a zero-dependency Node script invoked with `node`, so no exec bit
  and no second language runtime are needed. Model choices default in the script and are overridable
  through environment variables.
- **`harness-portability` gains two requirements** (supporting files; the second-opinion skill) and the
  owned-affordances requirement gains one clause making explicit that a tool other than `ctxr` named by a
  skill is outside its check — which its existing scenario already states.

## Non-goals

- **A `ctxr` command that calls model CLIs.** No `ctxr consult`, no adapter kind, and no vendor CLI name in
  `src/`. The code/judgment seam puts reading and synthesis in skills; the fan-out is plumbing for that
  judgment, and it ships with the skill rather than joining the CLI contract (design.md D1 argues the other
  side).
- **Requiring the model CLIs.** `ctxr verify` checks the tooling the write-path skills invoke; this skill is
  not on the write path and no command depends on it. A store without the CLIs keeps a skill whose preflight
  says so, and nothing else changes.
- **A `contexture.yaml` key for the critic lineup or models.** Environment overrides cover model drift
  without a new configuration surface; design.md D6 names what would change that.
- **Multi-round debate.** One isolated round, by design (D3). A rebuttal round is recorded as rejected with
  its strongest case, not deferred as a follow-up.
- **Removing pkm's skills.** That is a pkm pull request after a release carrying this change reaches the
  store; contexture never deletes a skill it did not write.
- **Opt-in gating for owned skills.** The skill ships to every store like every other owned skill (D7).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `harness-portability`: owned skills may carry supporting files; a new owned second-opinion skill over
  external model CLIs; the owned-affordances requirement states that tools other than `ctxr` are outside
  its check.

## Impact

Affected code: `src/core/skills.ts` (`SkillSeed` gains supporting files; `renderSkills`,
`syncShippedSkills`, and `skillPaths` write, compare, and prune them), a new body template
`templates/skills/ctxr-second-opinion.md`, and its supporting files under
`templates/skills/ctxr-second-opinion/` (the Node runner and its prompt fragments). Tests: the owned-skill
count and slug list, the staged-path vector init produces, the integration test for skills added by a
release, and new unit tests for the runner against stub CLIs on `PATH`. README: a row in the skills table.

Affected stores: additive. Every store gains one skill directory at its next `ctxr update`. The copy-mode
harness bridge already copies skill directories recursively, so supporting files reach a copy-bridged
harness with no change there. An older CLI running `ctxr update` against a store refreshed by this release
would prune the new skill, as it would any skill added in a release.
