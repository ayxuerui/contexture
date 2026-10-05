Get an independent read from models built by different labs before you commit to something you cannot
cheaply take back, or when your own taste is one vote among several. A second opinion from the same model
family you are running as mostly repeats you, so this skill sends the work to three command-line tools backed
by three different families and hands you their answers. It does not decide anything and it never carries out
what it reviews. Weighing the answers is your job, and steps 4 and 5 are how.

## 1. Critique, poll, or just answer?

- **Critique** when the question is *will this work?* A plan with several steps, an architectural or
  data-model choice, anything that deletes, force-pushes, sends, spends money, or touches secrets. Also a
  recovery sequence run against a broken system: those plans look fine right up to the step that makes it
  worse.
- **Poll** when the question is *which of these is better?* and being wrong costs mild regret: a name, a
  framing, a piece of copy, which of several tools fits. If all three agreeing would settle it, it is a poll.
  If you would still want each reviewer's top objections and a suggested edit, it is a critique.
- **Answer directly** when there is one right answer, when the operator has already decided and wants
  confirmation, or when the work is read-only investigation.

Push back when asked for a critique of a taste question. "Which domain suffix should I pick?" is a poll. "Should
I move my mail to a custom domain?" is a critique: it has steps, an order, and parts that cannot be undone. Say
which you are running and why in one line before you start.

A poll that asks a lens to judge whether something will *work* has become a critique. Stop and use that mode.

## 2. Check the tools before spending anything

```
node __SKILLS_PATH__/ctxr-second-opinion/run.mjs --preflight
```

Each of the three should report `OK` within about twenty seconds. The preflight also confirms that each
tool still accepts the options the runner passes, because a renamed option makes a reviewer silently run at
default settings and nothing else notices.

If one is down, stop and give the operator the two real choices: sign that tool in and re-run, or continue
with the others by adding `--only` and naming them. Do not quietly run with one model. A single model is not a
second opinion, and the runner refuses to start with fewer than two.

Failure signatures: `Not logged in` means Claude needs `/login`; a `401` or an invalid refresh token from
Codex means `codex login`; an agy call that hangs usually means its sign-in expired and it needs one
interactive run.

If the plan came from someone other than the operator, leave agy out with `--only claude,codex`. Claude
runs with no tools at all and Codex in a read-only sandbox. Agy has no mode that removes its ability to act:
it runs in an empty scratch directory with terminal restrictions, which contains an accident and not an attack.

## 3. Run a critique

Write the plan to a file. The reviewers can only cite what is written down, and they cite by step number:

```
# Plan: <one-line goal>

## Context
<two to five lines: what is being attempted and what constrains it>

## Steps
S1. <step>
S2. <step>

## Assumptions
- <what the plan takes for granted>

## Reversibility
- Reversible: <steps>
- Irreversible: <steps>
```

Then run it:

```
node __SKILLS_PATH__/ctxr-second-opinion/run.mjs --mode critique --plan-file <plan> --out <dir>
```

Three reviewers each read the plan alone: structure and ordering, failure modes and trust boundaries,
simplicity and cost. None sees another's answer. That is deliberate: reviewers who read each other converge
on whoever spoke first, and a correct one gets talked out of it. Do not add a second round.

The runner prints the letters it wrote, whether each is valid or blind, and any reviewer that failed. It
never prints which model wrote which letter. A **blind** critique returned a well-formed verdict but cited
nothing in the plan, so it was written without reading it; it does not count. **Partial** means fewer than
two valid critiques: say so at the top of your answer and do not call anything a consensus.

Add `--tier fast` to drop each family to a cheaper model, for a plan that is small and easy to redo. The
default tier is right for anything the operator will act on.

Each reviewer runs at its provider's own recommended default effort, not one this skill chose. Claude gets no
effort setting, so Claude Code applies its default for the model. Codex gets `medium`, the default its model
catalog declares; the runner passes it explicitly because Codex left to itself, with no setting pinned, can
resolve to no reasoning at all. Gemini's effort is part of its model name, and `High` is its default. Measured on a
short plan, a default critique took about 40 seconds in all, 30 to 37 seconds per reviewer, and costs a few tens
of cents. A deeper pass is a choice: set `CTXR_SECOND_OPINION_CLAUDE_EFFORT=max` and Claude alone took over
eight minutes on the same plan, close enough to the runner's ten-minute limit that you should start such a run
in the background and tell the operator it is under way. A machine that pins its own Codex effort in its
configuration is overridden by `medium`; set `CTXR_SECOND_OPINION_CODEX_EFFORT` to use another.

## 4. Synthesize on the letters first

Read the `critique-A`, `critique-B` and `critique-C` files and write your synthesis before you open
`manifest.json`. You share a model family with one of the reviewers, and models rate their own family's
writing higher. Reading letters first is what keeps that from steering you. Then open the manifest and
attach roles and models to the letters in the final report.

Write it in this order:

- **Verdicts.** One line per letter, and any blind or failed reviewer stated plainly, not buried.
- **Consensus (all agree).** Highest signal. When all three independently flag the same simplification,
  take it whole; do not keep a reduced version of complexity all three called wrong.
- **Majority (two of three).** Say whether the two agree on the fix or only on the diagnosis. Two
  reviewers who name the same problem often propose different repairs: choose on merit, meaning which
  repair keeps more of what you want (granular rollback, fewer side effects, smaller blast radius), and do
  not default to the majority's.
- **Evidence-backed dissent.** A lone finding that cites the plan gets its own section and stays there. The
  minority is right often enough that overruling it on your own authority is a net loss. Overrule only by
  showing what the dissent missed.
- **Vetoes.** A REJECT that carries a critical finding is stated as a veto, first, with its evidence.
- **Revised plan**, and **what changed and why**: each change tied to the letter and finding that drove it.
- **Recommendation**: proceed with the revision, revise further, or stop.

Where the reviewers pull apart on ceremony, one wanting more safeguards and another fewer, decide by blast
radius. If being wrong is expensive to undo, side with more safeguards. If it is cheap to undo, side with
fewer. Where a safeguard needs machinery an earlier round already turned down (a background job, a state file
kept across sessions, a hook), side with fewer: adding it now defeats the earlier decision.

When you have critiqued this plan before, reread that synthesis first. The reviewers only see the current text
and drift toward their own local optimum. Name any proposal that reverses an earlier decision, and hold the
earlier line unless the new critique brings evidence the old one lacked.

## 5. Say what you are biased about, then stop

State in the report that one reviewer shares your model family, and say when that reviewer's finding is what
drove the recommendation. Name any reviewer that ran a different model from the one you expected: the
manifest records the model each tool reported.

Then hand the synthesis to the operator and stop. This skill never executes a step of the plan it critiqued.
If the operator says to go, proceed with the revised plan. If they push back, treat that as a fourth critique
and run the skill again on the changed plan. It is a new run and not a continuation.

To record the outcome in the plan itself, add a section near the top headed `## Revisions after critique`
that says it overrides anything inconsistent below, one numbered item per change, each naming the finding
behind it. Leave the original text in place as the record of what was reviewed. Run one more critique after a
plan has been substantially rewritten and before you carry it out: new wording creates new gaps. Do not rerun
for a typo.

## 6. Run a poll

Write the question and the options to a file, then:

```
node __SKILLS_PATH__/ctxr-second-opinion/run.mjs --mode poll --prompt-file <question>
```

The same question goes to all three models, each answering with a pick, reasons, and anything surprising.
This mode names its files by model, because what you are reading is whether the models agree.

To get breadth as well as model diversity, add `--lens` with two or three taste lenses. Each model then
answers as every lens in one response, giving a lens-by-model grid. The built-in lenses are minimalist,
marketer, contrarian, end-user and brand-strategist. A store's own lens goes in as `Name:description`, for
example `--lens "minimalist,Plainspoken:blunt, substance first, distrusts slogans"`. A description may contain
commas: a comma starts the next lens only when what follows is a built-in lens name or begins `Name:`. So a
description must not contain a colon. Choose lenses that pull in different
directions; if two would obviously agree, drop one.

Read a lens grid on both axes. Down a column (one lens across the three models) agreement means that
taste value is robust to the model. Across a row (one model across the lenses) disagreement is where the
real decision is. Give your own recommendation and say which axis it rests on.

Report the answers, where they agree, where they split, and your read. The answers are evidence and not a
vote: one dissent with a substantive reason can outweigh two agreements. If two of the three agreeing models
include your own family, say so.

## 7. When something goes wrong

- A reviewer that timed out, exited non-zero, or returned no verdict is `failed` and carries its cause in
  the manifest. Report it. Do not rerun that one reviewer on a different model to fill the gap.
- Do not poll from inside a critique to settle a quick doubt. If you want a gut check mid-critique, answer it
  yourself.
- Model names change faster than releases. When a default is stale, set
  `CTXR_SECOND_OPINION_CLAUDE_MODEL`, `CTXR_SECOND_OPINION_CLAUDE_EFFORT`, `CTXR_SECOND_OPINION_CODEX_EFFORT`
  or `CTXR_SECOND_OPINION_AGY_MODEL` in the environment for the run. Nothing about the lineup lives in the store's configuration.
- The scratch files under the output directory hold each reviewer's raw output and are safe to delete when the
  operator has the synthesis. They can contain the plan, so do not commit them.
