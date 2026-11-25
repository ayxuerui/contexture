# Design

## Context

See proposal.md, Why. Current state, from `second-opinion-lineup-in-store-config` and `second-opinion-through-openrouter` (both shipped by 0.45.0):

- **The lineup is tier first.** `second_opinion.<tier>.<cli>` holds a `model`, an `effort` for two of the three, and an optional `openrouter` slug. Each entry is a strict object, and `model` has a schema default.
- **The entries are tool names:** `claude`, `codex`, `agy`. The same names are the values of `--only`, part of each per-critic variable, and the manifest's `cli` field. `ROLE_CLI` maps architect, skeptic and pragmatist onto them one to one.
- **The route has three sources.** The store's `openrouter`; `CTXR_SECOND_OPINION_<CLI>_OPENROUTER`, which wins over it; and `CTXR_SECOND_OPINION_<CLI>_MODEL`, which wins over the store's slug and puts the entry back on its tool.
- **No OpenRouter slug ships.** That change's D1 declined one, and kept the tool names because renaming them was out of proportion to one optional key.
- **Those changes' requirements are not yet synced into the main specs.** This change adds requirements and modifies none. Where it reverses one of theirs, the sync of this change must follow theirs and drop the reversed text (tasks.md, follow-ups).

## Goals / Non-Goals

**Goals:**
- **The block reads as two questions:** which families, and how each is reached.
- **A store with nothing written works,** on a machine with a key and on one without.
- **The models move with releases** unless a store pins one.
- **Where a plan is sent is decided in one reviewed place,** or by one visible fact about the machine.

**Non-Goals:**
- **Knowing OpenRouter's catalog at run time.** The tables are constants, and `preflight` already pings each resolved model.
- **A provider abstraction.** Two routes are still an `if`.

## Decisions

### D1. Family first, then `via`

```yaml
second_opinion:
  claude:
    via: cli
  gemini:
    via: openrouter
    strong: <vendor>/<model>
```

Each of `claude`, `gpt`, `gemini` and `grok` is a strict object with optional `via`, `strong`, `fast` and, for `claude` and `gpt`, `effort`. Nothing in the block has a default, so a written configuration holds only what a store chose.

- **This reverses the earlier D1,** which rejected a `via` beside `model` because a store could set the route and leave a tool's model name to be sent to OpenRouter. That hazard came from `model` having one shipped default for one route. Here a model ships for each route (D5), and a written model must have `via` beside it (D6), so the pair cannot be half set.
- **The case for keeping the tier first.** A store that pins one model at one tier writes one path, and the 0.45.0 block keeps working. Against that: the route is a property of the family, not of the tier, and tier first makes a store say it twice. Nobody routes a family through OpenRouter at `strong` and through its tool at `fast` on purpose.
- **One route per family, both tiers.** The tier chooses the model, never the route.
- **`off` leaves a critic out of every run.** A machine with a key runs four critics by default (D3), and a store that does not want to pay for the fourth needs a way to say so that is not `--only` on every call.
- **The tier-first keys are refused by name.** `strong` and `fast` at the top of the block fail the load with the new spelling. No migration rewrites them (proposal, Non-goals).

### D2. Critics are named for their families

`claude`, `gpt`, `gemini`, `grok`. One table in `lineup.ts` gives the tool that runs each of the first three: `claude`, `codex`, `agy`. The tool's name is used to start it, to copy its login, and in a message about the tool itself.

- **This reverses the earlier decision to keep `codex` and `agy`.** With the family as the key and the route beside it, a tool's name in the key is wrong whenever the route is not that tool. The cost is lower than it was: 0.45.0 is days old, and none of the known stores writes the block.
- **The case for aliases.** Both spellings working breaks nothing on update, and keeps two names for one critic with no date on which one goes. A refusal that names the replacement costs each affected host one edit.
- **Old names are refused, never read:** as keys of the block when the configuration loads, in `--only`, and as a set `CTXR_SECOND_OPINION_CODEX_*` or `_AGY_*` variable. An empty variable is unset, as everywhere else, so a deployment that passes one through empty keeps working.
- **The manifest keeps `cli` and `clis` as field names.** Their values are now critic names.
- **File names follow the critic:** `raw/skeptic-gpt.txt`, `poll-gemini.md`.

### D3. The default route

With no `via` written for a family:

1. If `OPENROUTER_API_KEY` is set and not empty: OpenRouter.
2. Otherwise the family's tool.
3. A family with no tool and no key is not in the lineup.

So a machine with no key runs `claude`, `gpt` and `gemini` on their tools, and a machine with a key runs all four through OpenRouter.

- **Why the key is the switch.** A key on the machine is the operator saying this machine may pay OpenRouter. Asking for a second line per family repeats that. It also suits the case the route exists for: a server paying for the models many members call needs no sign-in for three tools and no confinement, because no tool starts.
- **The case against, and what answers it.** The key is not in the store, so the store does not show where its plans go, and two machines serving one store can differ. Three things answer that. A written `via` always wins, so a store that cares writes it. `preflight` and the manifest say for each critic whether the configuration or the default chose the route (D7). And the skill has the agent say so in its report.
- **The case for the tool as the only default.** It is the 0.45.0 behavior and never surprises. It also means every store that sets a key writes four lines, and the first one did not know to.
- **It changes behavior on update.** A machine that holds a key for one routed critic and wrote nothing for the others moves all of them. The release note says so, and `via: cli` puts a critic back.
- **A written `openrouter` holds without a key.** That critic is asked and fails naming the variable. Dropping it silently would hide a broken deployment.

### D4. Grok is a fourth critic

- **Route.** It has no tool, so `via` takes `openrouter` or `off`, and `cli` is refused by the schema.
- **Role.** `verifier`: whether the plan says what done looks like, whether each step's result is something a person can check, and how a failure after the fact would be noticed. The other three cover structure, risk and simplicity; this one overlaps none of them. Its persona is `templates/second-opinion/personas/verifier.md`.
- **Letters** run to `D` when four answer.
- **The quorum stays two.** A second opinion needs two valid answers. Raising it for four would make a three-critic machine and a four-critic machine disagree on what partial means.
- **The case for Grok taking another critic's place.** It keeps three roles and three requests. It also drops a family from every run that uses it, which is the opposite of what a wider lineup is for.
- **`--only` names critics in the lineup here.** Naming one that is off, or Grok on a machine with no key, is a usage error that says why.

### D5. Shipped models

Two constants in `src/config/defaults.ts`:

- **The tools' models,** by family then tier, with the one effort contexture ships (`gpt`, `low`). Unchanged values, moved out of the schema's defaults.
- **The OpenRouter models,** by family then tier. The values are in proposal.md.

Neither is configuration: no key of `contexture.yaml` defaults to them, and `init` writes nothing from them.

- **How the OpenRouter rows were chosen.** `claude` and `gpt` are the families' counterparts of the tools' lineup. The plain GPT slugs are used: each `-pro` slug is the same model in a reasoning mode that spends far more per answer. `gemini` takes the model OpenRouter's list describes as the frontier Gemini 4 model, and the family's workhorse for `fast`; a first draft ranked by date and price and picked a model the list calls fast and mid-priced. `grok` has one current model.
- **The picks follow each model's own description,** read on 2026-11-25, not a benchmark.

### D6. A written model

`second_opinion.<family>.strong` or `.fast` names the model for that tier.

- **It needs `via` beside it.** A model name belongs to one route: a tool's own name, or a slug. Without a written route the default (D3) could send a tool's name to OpenRouter on one machine and a slug to a tool on another.
- **Through OpenRouter it must be a slug,** `<vendor>/<model>`. Anything else fails at load and not as OpenRouter's refusal later.
- **The other tier keeps the shipped model.**

### D7. Reports

For each critic, the manifest and `preflight --json` give:

- `route`: `cli` or `openrouter`.
- `route_source`: `store` when `via` is written, `default` otherwise.
- `model_asked` and `model_source`: the model, and `environment`, `store` or `default`.

`preflight`'s line reads, for example, `[OK  ] gemini  PONG (<vendor>/<model>, shipped default, through OpenRouter)`.

### D8. The route is never chosen for one run

- **`CTXR_SECOND_OPINION_<CRITIC>_OPENROUTER` is removed.** A set one, under any critic name it had, stops the run and names `second_opinion.<critic>.via`. Ignoring it would start a tool where the operator asked for a request.
- **`_MODEL` no longer moves a critic.** It names a model for a tool. Set for a critic that goes through OpenRouter, it stops the run: reading it as "use the tool" is the behavior this removes, and ignoring it hides a setting with no effect. `_EFFORT` stays unused there, as before, since it is commonly set for a whole host.
- **The tool's model and effort stay overridable for one run.** They choose how a tool runs, not where a plan goes.
- **The case for keeping the variables.** They are the fast way out when a key runs dry. That case is covered without them: a failed critic does not stop a run, `--only` leaves one out, and a longer outage is a one-line change. A variable kept for emergencies becomes the way a host is configured, which is how the first store came to route from `.env`.
- **How this sits with D3.** The key in the environment sets the default; it does not choose a route per run or per critic, and any written `via` overrides it.
- **The lineup a server with no store hands its commands** (`CONTEXTURE_SECOND_OPINION_LINEUP`) is that server's configuration file in transit, and a store's server strips it.

### D9. The scheduled check

`scripts/check-openrouter-models.mjs` fetches OpenRouter's public model list, with no key and no header naming the caller, and exits non-zero naming each shipped slug that is absent. A weekly workflow runs it and keeps one tracking issue open while it fails.

- **It reads the table from the TypeScript source by pattern,** so it needs no install and no build. A unit test fails when the pattern stops matching the real table.
- **It reports missing slugs only.** Whether a newer model should replace a shipped one is decided at release time.
- **It is not part of `npm test`,** which makes no network request.

### D10. What the skill, the tool descriptions and the README say

In `templates/`, never in TypeScript:

- **The layout:** the four families, `via` and its three values, and that Grok has no tool.
- **The default route,** with and without a key, and `via: cli` to hold a critic on its tool.
- **No model is printed.** The skill sends the reader to `preflight`, which prints the one in use.
- **Which tool each critic runs,** since a failure message names the tool.
- **The report:** name each critic that went through OpenRouter, and say when the default chose that route.
- **Coming from 0.45.0:** each old spelling and what replaces it.

The skill's banned wording and flag attribution are checked by its existing tests.

## Risks / Trade-offs

- **[A machine with a key starts paying for four critics on update]** → the release note says so; `via: cli` and `via: off` undo it per family; the key's own spending limit bounds it, which the skill tells the operator to set.
- **[The store does not show where plans go when the default applies]** → `route_source` in every manifest and `preflight` (D7), the skill's instruction to report it (D10), and a written `via` for a store that wants it fixed.
- **[A store or host still uses a 0.45.0 spelling]** → each is refused with its replacement before anything runs (D1, D2, D8). None of the known stores writes the block; one host's `.env` set a route variable.
- **[An older `ctxr` reads a store that writes the new block]** → the strict block refuses the unknown keys at load. Hosts update daily, and the release note says to update first.
- **[A shipped slug is retired between releases]** → the weekly check opens an issue (D9); `preflight` shows that critic down with OpenRouter's message; a store can write a slug the same day.
- **[OpenRouter is down and nothing moves a critic off it for one run]** → those critics fail and the run reports partial; a machine that also has the tools writes `via: cli` (D8).
- **[Four critics that all go through one gateway share its failures]** → a store that wants independence keeps some critics on their tools with `via: cli`.
- **[The fourth role adds noise]** → its persona tells it to approve a plan whose steps already end in something checkable, and the blind check applies to it as to the others.

## Migration Plan

- **Ship in a release.** A machine with no key and no `second_opinion` block runs exactly as before.
- **A machine with a key** runs four critics through OpenRouter after the update unless the store writes `via`.
- **A store that wrote the 0.45.0 block** rewrites it: the error at load names each key.
- **This host:** one store's `.env` set a route variable; it is removed, and the key alone now routes that store's second opinion.
- **Rollback** of one store's routes is writing `via: cli`. A release rollback needs the new block removed first.

## Open Questions

- **None.**
