## Context

See `proposal.md` — Why. The source material is pkm's `.agents/skills/plan-debate/` (a 445-line `SKILL.md`,
a 231-line `run_critics.sh`, three persona files, one output-contract prompt) and
`.agents/skills/multi-model-poll/` (a 290-line `SKILL.md`, a 338-line `poll.py`). Both call the same three
CLIs — `claude`, `codex`, `agy` — which the hermes harness image installs
(`contexture-images/harnesses/hermes/lib/install-agent-clis.sh`) and which both downstream stores therefore
already have.

Contexture's constraints on the destination:

- Owned skills are single files today. `SkillSeed` (`src/core/skills.ts`) renders one body from
  `templates/skills/<slug>.md`, and `syncShippedSkills` writes exactly `<skills_path>/<slug>/SKILL.md`. Its
  pruning removes whole unshipped directories that carry the managed header, never files within one. The
  only multi-file precedent is the vendored path (`readVendoredPayload`, a sorted recursive walk), which
  carries third-party provenance semantics this skill should not borrow.
- No `src/` code spawns a model CLI. The only `execFile` sites run `git`, `node`, and `node --check`.
- `writeFileAtomic` sets no file mode, so a shipped script lands non-executable.
- The rendered-skill tests ban seven tier words case-insensitively, and bind each `--flag` to the nearest
  preceding executable from a fixed list (`ctxr git gh npm npx node rg grep jq sed awk`) within a paragraph.
  `claude`, `codex` and `agy` are not on that list.

### What the survey changed

The survey covered comparable open-source work and the debate literature:

- trailofbits/skills `second-opinion` (per-CLI invocation references, "summarize agreement without turning
  it into proof", `agy` exit 0 after a denied tool);
- openai/codex-plugin-cc (a schema-validated review, and adversarial prompt wording);
- nyldn/claude-octopus (`/octo:debate` and `/octo:council`: quorum, veto seats, blind-seat detection built
  from real `agy` evasions);
- BeehiveInnovations/pal-mcp-server (stance prompts with integrity guardrails, and issue #162 where a
  critic that saw earlier verdicts inherited their stance);
- karpathy/llm-council (anonymized peer ranking).

Findings from the literature:

- **Voting accounts for most of debate's gain.** Choi et al., *Debate or Vote*, NeurIPS 2025, and Du et al.
  2023.
- **Extra rounds flip correct critics toward weaker peers.** Wynn et al., *Talk Isn't Always Cheap*, 2025.
- **An LLM judge favors its own family's output.** Panickssery et al., NeurIPS 2024.
- **Overturning a majority on a judge's say-so is net-negative, while an evidence-backed minority is right
  often enough to protect.** *Minority Sentinel*, 2026.

pkm's design was already the right shape: parallel, isolated, one round, synthesized by the orchestrator.
The decisions below mostly harden it.

## Goals / Non-Goals

**Goals:**
- One skill that is strictly better than either pkm skill, with the judgment pkm learned kept and the
  mechanics moved into one tested runner.
- The first owned skill with supporting files, done in a way the next one can reuse without further change.
- Honest containment claims. Say exactly which critic is sandboxed and which is only contained by its working
  directory.

**Non-Goals:** see `proposal.md` — Non-goals. At the design level, also not a goal: a general
"call any model" library. The runner knows three CLIs and their quirks, and adding a fourth is an edit to it,
not a plugin seam.

## Decisions

**D1 — The runner ships beside the skill, not as a `ctxr` command.**
The fan-out, including its timeouts, stdin handling, noise stripping, anonymization and validation, is a
supporting file, `run.mjs`, invoked by the skill as `node <skills_path>/ctxr-second-opinion/run.mjs`.

*The case for a `ctxr consult` command:*
- It would be TypeScript under the repo's type checker and vitest suite, as reviewable as everything else in
  `src/`.
- It would need no new multi-file skill machinery.
- It could read a lineup from `contexture.yaml` and be checked by `doctor`.
- A shipped script is still code contexture releases, and one that sits outside most of the checks the
  CLI gets.

*Against:*
- The code/judgment seam puts reading and synthesis in skills. This runner exists only to serve that
  synthesis, and has no meaning to any other command.
- Making it a command binds vendor CLI names and flags into the CLI contract and `cli-contract`'s surface.
  Those flags drifted three times in pkm's history (`--allowedTools` became `--tools`, codex effort ladders,
  and `agy` replaced `gemini`).
- It would make contexture the product that "runs Codex", which is a larger claim than "ships a skill that
  does".

*Recorded flip condition:* a second consumer of model fan-out inside the CLI. For example, a `ctxr` command
that wants a critique as part of its own work would justify promoting the runner.

Tests still reach it. `run.mjs` is plain ESM under `templates/`, and the unit suite imports and executes it
against stub CLIs (tasks §3).

**D2 — One skill, two modes.**
*Critique* answers "will this plan work?" and *poll* answers "which of these is better?".

*The case for keeping two skills:*
- Separate frontmatter descriptions trigger more precisely.
- A harness that loads skill bodies on demand would not carry critique's synthesis rules into a
  thirty-second taste poll.

*Against:*
- Both modes share the runner, the preflight, the CLI roster and the failure handling.
- The most valuable guidance pkm wrote sits on the boundary between them: "if all three agreeing would
  settle it, poll", and "a taste lens that judges whether something *works* has drifted into critique".
  Split across two files, that boundary drifted. pkm's copies already disagree on `--sandbox` for `agy`.
- One description can name both triggers.

*Flip condition:* evidence of mis-triggering, where critique runs for a taste question or the reverse, in
stores using the merged skill.

**D3 — One isolated round, with no rebuttal round.**
Each critic sees the plan and its own role, nothing else.

*The case for a rebuttal round:*
- A clean 1-versus-2 split is exactly where the minority is sometimes right (*Minority Sentinel*: about
  one split in four).
- Letting the minority answer the majority's findings could surface that.

*Against:*
- *Debate or Vote* shows that debate without a correction signal does not improve expected correctness.
- *Talk Isn't Always Cheap* shows strong critics flipping to weaker peers' wrong answers more often than
  the reverse.
- PAL #162 is a production instance of stance leakage the moment critics see each other.
- The protection the minority actually needs is already in the synthesis rules: evidence-backed dissent
  gets its own section and is never outvoted.

*Flip condition:* a record of critiques where a split was later resolved in the minority's favor *and* the
minority's first-round critique did not already contain the decisive evidence.

**D4 — Anonymize before synthesis.**
The runner writes `critique-A.md`, `critique-B.md` and `critique-C.md` with letters assigned in a shuffled
order, and writes the letter→role→model mapping only to `manifest.json`. The skill instructs synthesis on
letters first and reads the manifest last.

*The case against:*
- Role is useful context. Knowing that a critique came from the skeptic tells the reader to expect
  paranoia.

*Resolution:*
- Each critique restates its role in its first line, so role is recoverable from the text. Only the
  model family is hidden, and model family is where the orchestrator's self-preference operates.
- The mapping is revealed in the final report, so nothing is lost to the reader. The cost is one file read.

**D5 — A stricter output contract, validated, with blind-seat detection.**

The contract has four sections, in order:
- the verdict (`APPROVE | APPROVE_WITH_CHANGES | REJECT`);
- up to three findings, each carrying a severity (`critical|major|minor`), a confidence between 0 and 1,
  evidence citing a plan step (`S3`) or a `path:line`, and a concrete change;
- suggested changes;
- what not to change.

The prompt carries codex-plugin-cc's adversarial wording:
- try to break confidence in the plan;
- approve only if no substantive finding can be supported;
- one strong finding beats several weak ones;
- never invent steps or lines.

The runner validates each critique:
- **Missing verdict.** The critique is recorded as failed.
- **Blind.** No finding cites a step number the plan actually has. The critique is marked blind and not
  counted. This check was built from real `agy` evasions, where the model returned a plausible review of a
  plan it had not read.

*The case against the step-citation rule:*
- A genuinely good plan earns `APPROVE` with no findings, and would read as blind.

*Resolution:*
- An `APPROVE` with zero findings is valid by definition and is not tested for citations.
- The blind test applies only when findings exist and none resolves.

*Rejected:* octopus-style quality scoring by grep (counting code fences, brackets, and mentions of other
models). It rewards form over substance.

**D6 — Model choice lives in the script, overridable by environment, with no `contexture.yaml` key.**
Defaults sit in one table in `run.mjs`, in two tiers. `strong` is the default. `fast` downshifts each family
to its cheaper model, for trivial polls. The overrides are:
- `CTXR_SECOND_OPINION_CLAUDE_MODEL`
- `CTXR_SECOND_OPINION_CLAUDE_EFFORT`
- `CTXR_SECOND_OPINION_CODEX_EFFORT`
- `CTXR_SECOND_OPINION_AGY_MODEL`

The `CTXR_` prefix is right here and not `CONTEXTURE_`. These variables name a skill (`ctxr-<name>`), not
a store-resident concept.

*The case for a config key:*
- Model names drift faster than contexture releases.
- A store should be able to pin its lineup in the one file contexture already owns.

*Against:*
- An environment override fixes drift the same day with no release.
- A config key would be the only one in `contexture.yaml` that no `ctxr` command reads, and it would put
  vendor model names into a file the spec says is store-describing.

*Flip condition:* a store that needs a persistently different lineup, not just a newer model name.

**D7 — Always shipped, not opt-in.**
Every owned skill ships to every store, and there is no owned-skill gating mechanism. Building one for this
skill would need a new config surface (a new optional block, per the opt-in-key precedent) plus
prune-when-disabled semantics.

*The case for opt-in:*
- A store without the three CLIs carries a skill it cannot use.

*Against:*
- The skill's first step is a preflight that says exactly which CLIs are missing and offers a smaller poll
  or no poll.
- Both known stores have all three CLIs.
- A dead skill costs one directory. An opt-in mechanism costs a schema change and a pruning rule.

*Flip condition:* a store reporting that the skill triggers where it cannot run.

**D8 — Node for the runner, not Python or shell.**

*The case for Python:*
- pkm's `poll.py` already exists and works.

*Against:*
- Node is the one runtime guaranteed wherever `ctxr` runs, while Python is not guaranteed.
- `child_process.spawn` with an argv array and `stdin` gives the same no-shell property `poll.py` has.
- The runner is invoked as `node <path>`, which sidesteps the exec bit that `writeFileAtomic` does not set.
- `node` is already on the flag-attribution executable list, so skill prose naming runner flags is
  attributed correctly.

`run_critics.sh` is not carried forward. Its `awk` noise stripper and `$(...)` argv hand-off are the fragile
parts pkm itself documented.

**D9 — Containment is stated per CLI, honestly.**

| Critic | Containment |
|---|---|
| `claude` | `-p --max-turns 1 --tools ""`, no tools at all |
| `codex` | `exec --sandbox read-only --ephemeral --skip-git-repo-check -`, read-only sandbox, prompt on stdin, no persisted session |
| `agy` | `-p <prompt-argv> --sandbox --disable-slash-commands`, with no true read-only mode (pkm verified it writing outside `/tmp` and fetching a URL under `--sandbox`) |

All three run with an empty scratch directory as their working directory, so an `agy` critic that does
reach for tools finds no repository to modify by relative path. The spec says "read-only or no-tools mode
where one exists, and an empty working directory in every case". It deliberately does not claim `agy` is
contained. The skill tells the agent that plan text from an untrusted source should run with `agy` dropped
(`--only claude,codex`).

**D10 — The judgment pkm learned stays, in the skill body; the history does not.**
These rules carry over:
- the critique/poll/answer boundary and its worked example (choosing a TLD is a poll; migrating an email
  identity is a critique);
- the blast-radius tiebreaker when the skeptic wants more controls and the pragmatist wants fewer;
- the rule against re-adopting infrastructure an earlier round rejected;
- the iteration-consistency check across successive critiques of one plan;
- "2/3 agreeing on the diagnosis is not agreement on the fix";
- "a 3/3 simplification is the highest-signal output";
- folding results as an AUTHORITATIVE deltas section;
- re-critiquing once after a substantial consolidation.

These do not carry over:
- the dated model-assignment history;
- the per-version flag archaeology, which belongs in the runner's comments;
- pkm-specific worked examples;
- the "house taste" lens named for one operator, which a store passes inline as `Name:description`.

The body stays in `templates/skills/ctxr-second-opinion.md` per the shipped-prose-in-templates rule. The
critic contract, the three persona mandates and the lens roster are supporting files the runner reads, so
the prompt text is reviewable as markdown too.

**D11 — The skill's name is judgment-shaped.**
`ctxr-second-opinion` names what the operator gets, not a command. There is no `ctxr second-opinion`, and
per the skill-naming contract a `ctxr-<group>` name would falsely assert one. This follows the
`ctxr-submit` / `ctxr-land` precedent.

*Alternatives considered:*
- `ctxr-cross-examine`: vivid, but reads as adversarial-only and undersells poll.
- `ctxr-critique`: reads like a command group.
- `ctxr-debate`: describes the multi-round shape D3 rejects.

## Risks / Trade-offs

- **The CLIs change their flags without notice**, and a critic silently runs at default settings.
  → The runner records the model each CLI reports in the manifest. The skill tells the agent to name a
  mismatch in the synthesis. `--preflight` checks the flags the runner passes against each CLI's help, not
  just that the CLI exists.
- **Directory-mirror pruning removes a file an operator put in an owned skill directory** (spec: *Owned
  skills may carry supporting files*). Today no owned directory holds anything but `SKILL.md`, so the first
  release deletes only what an operator added by hand.
  → Update names every removed path in its report. Operators customize skills by adding their own skill,
  not by editing a managed one, which update already overwrites.
- **`agy` executes something embedded in a plan.**
  → It runs in an empty working directory, the prompt frames plan text as data, and the skill tells the
  agent to drop `agy` for untrusted plan text. The residual risk is stated in D9, not hidden.
- **Cost surprise.** Strong tier with maximum reasoning is roughly $0.30–$0.80 and 1–3 minutes per critique.
  → The runner prints the plan's size and the tier before dispatch. The skill states the cost bands and
  when to use `fast`.
- **An older CLI prunes the new skill** after a store is refreshed by this release.
  → This is the known release-propagation hazard for any added skill, handled by the release sequence, not
  by this change.
- **The orchestrator still grades a Claude critic.**
  → Anonymization (D4) reduces self-preference. The skill tells the agent to name the shared model family
  whenever the Claude critic's finding drives the recommendation.

## Migration Plan

This change is additive. After release:
1. Stores pick up the skill on their next `ctxr update`.
2. pkm opens its own pull request deleting `.agents/skills/plan-debate/` and
   `.agents/skills/multi-model-poll/`, moving its worked example into a store note if wanted, and
   re-expressing its house-taste lens as an inline lens in its conventions.

Rollback is a release that drops the seed. Update then removes the directory, as for any unshipped owned
skill.

## Open Questions

- Should `--preflight` cache a successful result for the session to save 5–20 s per invocation? This can be
  added to the runner without spec change once real usage shows whether repeated invocations are common.
