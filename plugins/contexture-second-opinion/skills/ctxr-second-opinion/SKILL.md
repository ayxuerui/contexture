---
name: ctxr-second-opinion
description: Get an independent critique of a plan, or a poll on a taste call, from three different model families run in parallel, and synthesize their answers without running the plan.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Second opinion

## Which store, and where

This skill runs in a shell that runs `ctxr`, or through a contexture store's server. Settle two things first.

**Which store:** the one the person means. With several contexture connectors attached, use that store's,
and ask when it is unclear. Nothing from one store's connector goes to another's.

**Where:** in a checkout of that store (a `contexture.yaml` at the working directory's root and a shell
that runs `ctxr`), follow each step in the shell as written, even when the store's connector is attached
too. Otherwise work through the store's connector:

- A `ctxr session <verb>` step is the tool `session_<verb>`; `session_start` takes the session's name as
  `label`. A `ctxr second-opinion <verb>` step is the tool `second_opinion_<verb>`. Every other `ctxr` step
  is the `ctxr` tool, or `ctxr_write` when it writes, with the words after `ctxr` as `args`, one per entry:
  `ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`.
- A command's options are the tool's fields, named without the dashes. `session` names the session's
  directory, which `session_start` returns and `session_list` lists; `ctxr_write` always needs one. For
  `ctxr_write`, a file you prepared goes as `input`, with `@input` in `args` where its path goes.
- Paths go under the session's root: the note `work/a.md` is `<worktrees path><directory>/work/a.md` for
  `Read`, `Edit`, `Write`, `Move`, `Delete`, `Grep` and `Glob`. A path outside a session reads the store as
  last approved and cannot be written. Commits, pushes and pull requests happen only in `session_submit`.
- The server keeps sessions between conversations but cannot tell conversations apart. At the start of
  one, call `session_list` and mention each open session, what it holds and any requested changes.
- Landing, upgrading and work inside a store mounted under `shared/` are not done through the server. A
  person lands an approved change from the store's approval page.
- When a step names a tool the connector does not list, or the `ctxr` tool refuses a command as one it
  does not run, the server runs an older ctxr (*This store* gives its version). Say so, then skip the step
  or take the nearest one offered. Never improvise a replacement for a step that writes.
- A store setting written as a placeholder, such as `<inbox path>` or `<default branch>`, takes the value
  the connector's instructions give under *This store*, inside a path too. AGENTS.md states most of them;
  otherwise ask.

Get an independent read from models built by different labs before you commit to something you cannot
cheaply take back, or when your own taste is one vote among several. A second opinion from the same model
family you are running as mostly repeats you, so this skill sends the work to three or four models from
different families and hands you their answers. `ctxr second-opinion critique` and its `poll`
sibling do the mechanics: they launch the tools, contain them, time them out, and anonymize what comes
back. They do not decide anything, and they never carry out what they review. Weighing the answers is your job, and steps 4 and 5 are how.

## 1. Critique, poll, or just answer?

- **Critique** when the question is *will this work?* A plan with several steps, an architectural or
  data-model choice, anything that deletes, force-pushes, sends, spends money, or touches secrets. Also a
  recovery sequence run against a broken system: those plans look fine right up to the step that makes it
  worse.
- **Poll** when the question is *which of these is better?* and being wrong costs mild regret: a name, a
  framing, a piece of copy, which of several tools fits. If the models agreeing would settle it, it is a poll.
  If you would still want each reviewer's top objections and a suggested edit, it is a critique.
A critique is required, not optional, before implementing a change that is architectural, irreversible, or touches
what may be disclosed and to whom — run it on the written plan before the work, never as a justification after it.
Its verdict, and the reasoning behind the option chosen, land in the pull request's body: for a structural change
the pull request and its commit are the decision record, and there is no separate governance step.

- **Answer directly** when there is one right answer, when the operator has already decided and wants
  confirmation, or when the work is read-only investigation.

Push back when asked for a critique of a taste question. "Which domain suffix should I pick?" is a poll. "Should
I move my mail to a custom domain?" is a critique: it has steps, an order, and parts that cannot be undone. Say
which you are running and why in one line before you start.

A poll that asks a lens to judge whether something will *work* has become a critique. Stop and use that mode.

## 2. Check the tools before spending anything

```
ctxr second-opinion preflight
```

Each critic should report `OK` within about twenty seconds. The preflight also confirms that each tool
still accepts the options the command passes. Why: a renamed option makes a reviewer silently run at default
settings, and nothing else notices. Give `ctxr second-opinion preflight` the same `--tier` you will run with.
The preflight pings each tool with that tier's model, names the model it tested, and says where that model
came from: the environment of this run, the store's configuration, or the shipped default. Why: a model the
tool no longer offers fails only at the tier that uses it.

Through a server, call the `second_opinion_preflight` tool. Give it the tier as `tier`. Why: the server
runs each second-opinion command through a tool of its own, and its `ctxr` tool refuses them.

If one is down, stop and give the operator the two real choices: sign that tool in and re-run, or continue
with the others by rerunning `ctxr second-opinion critique` with `--only` and naming them. Do not quietly run with one
model. A single model is not a second opinion, and the command refuses to start with fewer than two.

The critics are `claude`, `gpt` and `gemini`. Each runs a tool: `claude` runs Claude Code, `gpt` runs Codex and
`gemini` runs agy. Why: a critic is named for its model family, and a failure message names the tool.

Failure signatures: `Not logged in` means Claude needs `/login`; a `401` or an invalid refresh token from
Codex means `codex login`; an agy call that hangs usually means its sign-in expired and it needs one
interactive run.

A tool that answers `invalid model selection`, or says in its own words that it does not know the model, is
signed in. Its account is not offered the model it was asked for, so signing in again changes nothing. The
preflight line ends with the model asked for and where it came from. The fix is to the lineup (section 7),
and until then that tier runs with the other two.

A critic can run through OpenRouter in place of its tool (section 7). Its preflight line then ends with
`through OpenRouter`. The preflight checks that critic with one request for the model of the tier.

- `OPENROUTER_API_KEY is not set` means the key is missing. Set it in the environment of the command. Do not
  write it in the store. Why: everyone who can clone the store reads its configuration.
- `OpenRouter answered` with a status carries OpenRouter's own message. A model it does not have is a fix to
  the lineup. When the line also says `shipped default`, the release's model for that family is gone:
  write a current slug for that critic and tell the operator to update `ctxr`. A message about the data policy means no provider that declines data collection offers that
  model: name another model.
- `could not reach OpenRouter` behind a proxy needs `NODE_USE_ENV_PROXY=1` in the environment of the command.
  Why: without it the runtime ignores the proxy variables.

Through the store's server, the operator signs the tools in on the server. Tell the person which tool is
down. Ask them to pass that on to the operator.

Each tool runs in a new folder that is its home and holds only its own login. Where the machine supports it,
the kernel also stops the tool from reading anything outside that folder, and the preflight reports
`confined: yes`. Why: a plan can carry instructions from whoever wrote it, and a tool that cannot read a
secret cannot quote it. The store's server starts a tool only when it is confined. A critic answered through
OpenRouter starts no tool, so the server runs it either way.

The tools see only an allowlisted environment: the search path, home, locale, proxies, and their own login
variables. Forge and contexture variables never reach them. When a tool fails because it needed a variable the
allowlist dropped, a failing `ctxr second-opinion preflight` names the variables it withheld (names, never
values). Name that variable in `CTXR_SECOND_OPINION_PASS_ENV` for the run. A forge or contexture variable there
stops the command before any tool starts. Through the store's server, these variables are the operator's to
set on the server. Ask the operator to set one. Do not try to set it from the conversation.

If the plan came from someone other than the operator, leave `gemini` out when it runs its tool: run
`ctxr second-opinion critique` with `--only` and name the other critics, as in `--only claude,gpt`. Claude runs with no tools at all and Codex in a read-only sandbox. Agy has no mode that
removes its ability to act: it runs in an empty scratch directory with terminal restrictions, which contains
an accident and not an attack.

Keep `gemini` in that run when its preflight line ends with `through OpenRouter`. Why: that critic is one request
with no tools, so it cannot act.

## 3. Run a critique

Write the plan down in this shape. Why: the reviewers can only cite what is written down, and they cite by
step number.

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

Write the plan to a file. Start the critique:

```
ctxr second-opinion critique --plan-file <plan> --detach
```

The command prints a run id and returns at once. The reviewers keep working in the background. Fetch their
critiques:

```
ctxr second-opinion result <run>
```

Each call waits up to 45 seconds. If it says the run is still running, run the same command again. Why: a
chat app can drop a tool call after a minute or less, and a critique often takes two minutes or more. Short calls never
reach that limit.

If the command says a second opinion is already running and names a run, that run is yours. Fetch it with
`ctxr second-opinion result` and that run id. Do not start another. If it names no run, wait a few minutes and
start again. Why: one second opinion runs at a time on a machine.

If `--detach` or `result` is refused as unknown, the installed ctxr is older. Run
`ctxr second-opinion critique --plan-file <plan>` without `--detach`. It returns when the critiques are ready.

Through a server, do not write a file. Call `second_opinion_critique` with the whole plan as `plan`. Why:
the tool takes text and reads no file, so the reviewers see exactly what you sent. The call waits up to 45
seconds. A run that has finished returns the critiques in that call. A run that is still going returns
`running:` and a run id. Then call `second_opinion_result` with that id as `run`. Call it again while it
says the run is still running. Why: no single call can outlast the limit of the chat app.

Each reviewer reads the plan alone. Each reviews it in four roles and answers in four sections: structure and
ordering, failure modes and trust boundaries, simplicity and cost, and how anyone will know the plan worked.
No role belongs to one reviewer. Why: a defect is often seen by one model only, so every role needs every
model. A run with two reviewers still covers the four roles. The sections come in a different order for each
reviewer, and a section may say `None.`. None sees another's answer. That is deliberate: reviewers who read
each other converge on whoever spoke first, and a correct one gets talked out of it. Do not add a second round.

The command prints the letters it wrote, whether each is valid or blind, and any reviewer that failed. It
never prints which model wrote which letter. With `ctxr second-opinion critique --json` the same result, with
the manifest, arrives as one envelope instead. With `ctxr second-opinion critique --print`, the command prints
each critique under its letter, then the letter table, and writes no files. `ctxr second-opinion result`
prints in the same way, and so does each tool of a server. A **blind** critique returned a well-formed verdict but cited
nothing in the plan, so it was written without reading it; it does not count. **Partial** means fewer than
two valid critiques, and the command then exits with the failed-check status rather than success: say so at
the top of your answer and do not call anything a consensus.

The default tier, `strong`, runs each family's frontier model. Run `ctxr second-opinion critique` with
`--tier fast` to use each family's workhorse model instead, for a plan that is small and easy to redo. Why:
the frontier models are slower and cost more, and a cheap plan does not need them. The default tier is right
for anything the operator will act on.

Each reviewer runs at its provider's own recommended default effort, not one this skill chose. Claude gets no
effort setting, so Claude Code applies its default for the model. Codex gets the default its model catalog
declares, which the command passes explicitly. Why: Codex left to itself, with no setting pinned, can resolve
to no reasoning at all. Gemini's effort is part of its model name, and the command names each model at its
default level. Measured through OpenRouter at the default tier, a critique took as long as its
slowest reviewer: Grok took 190 to 210 seconds, Gemini about 105, Claude 55 to 65, and GPT about 30. The fast tier is
quicker and costs less. A deeper pass is a choice: with `CTXR_SECOND_OPINION_CLAUDE_EFFORT=max`, Claude on
Opus alone took over eight minutes on a short plan. That is close to the command's ten-minute limit per tool,
and Fable is slower than Opus; raise it with `ctxr second-opinion critique --timeout <seconds>` for such a
run. Tell the operator that such a run is under way. Through the store's server, each tool gets at most 600
seconds, the same default as in a shell. A machine that pins its own
Codex effort in its configuration is overridden by the catalog default; set `CTXR_SECOND_OPINION_GPT_EFFORT`
to use another.

## 4. Synthesize on the letters first

Read the `critique-A`, `critique-B` and `critique-C` files and write your synthesis before you open
`manifest.json`. When the critiques were printed, write your synthesis before you read the letter table
below them. You share a model family with one of the reviewers, and models rate their own family's
writing higher. Reading letters first is what keeps that from steering you. Then open the manifest and
attach critics and models to the letters in the final report.

Write it in this order:

- **Verdicts.** One line per letter, and any blind or failed reviewer stated plainly, not buried.
- **Defects, grouped.** Group the findings by the defect they name, across letters and across roles. Why: the
  same defect often sits under different roles in different letters. Count each defect once. List the letters
  that raised it.
- **Consensus (all agree).** Look here first. When every reviewer independently flags the same simplification,
  take it whole; do not keep a reduced version of complexity they all called wrong. Agreement between letters
  is not proof. Why: models from different labs make the same mistakes.
- **Majority (more than half).** Say whether they agree on the fix or only on the diagnosis. Two
  reviewers who name the same problem often propose different repairs: choose on merit, meaning which
  repair keeps more of what you want (granular rollback, fewer side effects, smaller blast radius), and do
  not default to the majority's.
- **Evidence-backed dissent.** A finding that one letter alone raised gets its own section and stays there.
  Check it against the plan. Say whether it holds. Why: most real defects in a review by several models are
  raised by one model only, so dropping lone findings loses the most. Overrule one only by showing what it
  missed.
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

Name each reviewer that ran through OpenRouter. The manifest gives each reviewer's `route`. Why: that plan
went to OpenRouter and to the provider behind it, and the operator decides whether that is acceptable.
The manifest gives `route_source` as `default` when no `via` was written and the key on the machine chose
the route. Say so in the report: the store does not show that choice.

Then hand the synthesis to the operator and stop. This skill never executes a step of the plan it critiqued.
If the operator says to go, proceed with the revised plan. If they push back, treat that as one more critique
and run the skill again on the changed plan. It is a new run and not a continuation.

To record the outcome in the plan itself, add a section near the top headed `## Revisions after critique`
that says it overrides anything inconsistent below, one numbered item per change, each naming the finding
behind it. Leave the original text in place as the record of what was reviewed. Run one more critique after a
plan has been substantially rewritten and before you carry it out: new wording creates new gaps. Do not rerun
for a typo.

## 6. Run a poll

Write the question and the options to a file. Start the poll:

```
ctxr second-opinion poll --prompt-file <question> --detach
```

Fetch the answers with `ctxr second-opinion result` and the run id it printed, as for a critique (section 3).
Run it again while it says the run is still running.

Through a server, call `second_opinion_poll` with the question and the options as `prompt`. Give it the
lenses as `lens`. Why: the tool takes text and reads no file. When the result starts with `running:`, call
`second_opinion_result` with the run id as `run`, as for a critique.

The same question goes to every model in the lineup, each answering with a pick, reasons, and anything surprising.
This mode names its files by model, because what you are reading is whether the models agree.

To get breadth as well as model diversity, run `ctxr second-opinion poll` with `--lens` and two or three taste
lenses. Each model then answers as every lens in one response, giving a lens-by-model grid. The built-in
lenses are minimalist, marketer, contrarian, end-user and brand-strategist. A store's own lens goes in as
`Name:description`, for example `--lens "minimalist,Plainspoken:blunt, substance first, distrusts slogans"`.
A description may contain commas: a comma starts the next lens only when what follows is a built-in lens name
or begins `Name:`. So a description must not contain a colon. Choose lenses that pull in different
directions; if two would obviously agree, drop one.

Read a lens grid on both axes. Down a column (one lens across the models) agreement means that
taste value is robust to the model. Across a row (one model across the lenses) disagreement is where the
real decision is. Give your own recommendation and say which axis it rests on.

Report the answers, where they agree, where they split, and your read. The answers are evidence and not a
vote: one dissent with a substantive reason can outweigh two agreements. If the agreeing models
include your own family, say so.

## 7. When something goes wrong

- A reviewer that timed out, exited non-zero, or returned no verdict is `failed` and carries its cause in
  the manifest. Report it. Do not rerun that one reviewer on a different model to fill the gap.
- The command's status says which kind of trouble it is. Success means at least two valid answers. The
  failed-check status means it ran and the result is partial, or the preflight found a tool down. The usage
  status means nothing ran: an argument was wrong, fewer than two tools were named, or the pass-through
  variable named a forge or contexture variable.
- Do not poll from inside a critique to settle a quick doubt. If you want a gut check mid-critique, answer it
  yourself.
- The lineup is the store's configuration, in `second_opinion` in `contexture.yaml`. It is keyed by model
  family: `claude`, `gpt`, `gemini` and `grok`. Under a family, `via` says how that critic is reached:

  ```yaml
  second_opinion:
    gemini:
      via: openrouter
  ```

  `via` is `cli` (the family's own tool), `openrouter`, or `off` (the critic is in no run). Grok has no tool,
  so it takes `openrouter` or `off`.
- A family with no `via` takes the default of the machine. A machine with no `OPENROUTER_API_KEY` runs the
  tools of `claude`, `gpt` and `gemini`, and Grok is not in the lineup. A machine that has the key sends all
  four through OpenRouter. Why: an operator who sets the key has chosen that route, and one who has not can
  only run the tools. Write `via: cli` for a critic that must stay on its tool where a key is set.
- The model is not written. Each release ships a model for every family, route and tier, and a store follows
  it from release to release. Run the preflight to see the model in use and whether it is a shipped default.
  To fix a model, write it for its tier beside `via`:

  ```yaml
  second_opinion:
    gemini:
      via: openrouter
      strong: <vendor>/<model>
  ```

  The tiers are `strong` and `fast`. Through OpenRouter a model is a slug. For a tool it is a name that the
  tool lists. A model with no `via` beside it is refused when the configuration loads. Why: a model name
  belongs to one route. `claude` and `gpt` also take `effort`, for their tools.
- Through release 0.45.0 the lineup had the tier first, `gpt` was named `codex` and `gemini` was named `agy`.
  The command refuses the old keys, an old name in `--only`, and an old variable, and it gives the new
  spelling. It also refuses a `CTXR_SECOND_OPINION_*_OPENROUTER` variable, which chose a route in that
  release: write `via` in the configuration.
- That file changes like any other part of the store: in a session, by a reviewed pull request, which is the
  operator's to open. Outside a store the command runs with nothing written.
- Through a store's server, `mcp.second_opinion` in `contexture.yaml` lists who can run a second opinion. A
  store that does not write the key lets every reader run one. A store that writes the key lets only the
  listed people run one, and an empty list lets nobody. Why: each run spends the operator's model accounts,
  and the operator decides who spends them. A person on that list alone gets the four second-opinion tools
  and reads nothing of the store.
- A server that offers only the second opinion has no store. Its operator names the people and the lineup
  in the file that server reads. Ask the operator for a change. Do not look for a `contexture.yaml` there.
- A critic that goes through OpenRouter starts no tool. An account may not offer a family's frontier model
  through its tool, and OpenRouter has no such limit. Each request spends money on the key. Tell the operator
  to set a spending limit on the key. The plan goes to OpenRouter and to the provider behind it. The command
  asks OpenRouter to use only providers that do not collect it.
- For one run, the environment names the model of a critic that runs its tool: `CTXR_SECOND_OPINION_CLAUDE_MODEL`,
  `CTXR_SECOND_OPINION_CLAUDE_EFFORT`, `CTXR_SECOND_OPINION_GPT_MODEL`, `CTXR_SECOND_OPINION_GPT_EFFORT` or
  `CTXR_SECOND_OPINION_GEMINI_MODEL`, each covering both tiers. Use it for a deliberate deeper pass, or on a
  machine whose account differs from the store's. Through the store's server, those variables are the
  operator's to set on the server, and the lineup is the one the served store has, never an open session's.
- The route is never chosen for one run. No variable and no option sends a critic through OpenRouter for one
  run, or puts such a critic back on its tool. Why: the route decides where the plan is sent, and the operator
  reviews that as a change to the store. To change a route, change `via` in `contexture.yaml` in a session.
  A `_MODEL` variable for a critic that goes through OpenRouter stops the command before it starts: unset the
  variable, or write `via: cli` for that critic.
- A tool that refuses its model is a failed reviewer. The command does not try another model for it.
- A critic that fails through OpenRouter is a failed reviewer. The command does not start its tool in its
  place.
- The scratch files under the output directory hold each reviewer's raw output and are safe to delete when the
  operator has the synthesis. They can contain the plan, so do not commit them. A printed run writes none. A
  detached run keeps its plan and answers in a folder only its user can read. The folder is removed one hour
  after the run ends.
