# Proposal

## Why

Release 0.45.0 let a store send one critic of a second opinion through OpenRouter, and the first store to try it stopped at a placeholder on 2026-11-25. Three things were in the way:

- **The store had to write a model slug,** and nothing said which one. A slug also goes stale: the store keeps asking for it after the vendor ships a better model, while the tools' model names move with each release.
- **The lineup read in two vocabularies.** Its entries were named for tools (`codex`, `agy`) and its values for model families, with the tier above both, so one critic's settings sat in two places.
- **The route could be set in three places:** the store, a per-critic variable, and a second variable that undid the first. The route decides where a plan is sent, and only one of the three is reviewed.

The lineup should read the way an operator thinks about it: which model families take part, and how each one is reached. Everything else should have a shipped default.

## What Changes

- **BREAKING: the lineup is keyed by model family.** `second_opinion` holds `claude`, `gpt`, `gemini` and `grok`. Under each, `via` says how the critic is reached: `cli` (the family's own tool), `openrouter`, or `off`. The tier-first layout of 0.45.0 (`second_opinion.strong.<critic>`) is refused when the configuration loads, with the new spelling.
- **BREAKING: two critics are renamed.** `codex` becomes `gpt` and `agy` becomes `gemini`, in the configuration, `--only`, the per-critic variables, the manifest, `preflight` and the files a run writes. The tools keep their names. An old name is refused with the new one and is never read as an alias.
- **Grok is a fourth critic.** It has no tool, so it is reached through OpenRouter or not at all. It takes a fourth role, `verifier`: how anyone will know the plan worked. The quorum stays at two.
- **Models are shipped, not written.** `ctxr` carries a model for every family, route and tier. A store that wants another writes it for its tier beside `via` (`second_opinion.gemini.strong`). A model with no `via` beside it is refused, since a model name belongs to one route.
- **With no `via` written, the route is the machine's default.** Where no `OPENROUTER_API_KEY` is set, each critic runs its tool and Grok is left out, so three run, as today. Where the key is set, all four go through OpenRouter. A written `via` always wins.
- **BREAKING: the route is never chosen for one run.** The `CTXR_SECOND_OPINION_<CRITIC>_OPENROUTER` variables are removed; a set one stops the run and names the configuration key. A `_MODEL` variable no longer moves a critic back to its tool; set for a critic that goes through OpenRouter, it stops the run.
- **Reports say why a critic went the way it did.** `preflight` and the manifest give each critic's route, whether the configuration or the default chose it, the model asked for, and where that model came from.
- **A scheduled check reports a shipped OpenRouter slug that OpenRouter no longer lists.** It reads OpenRouter's public model list with no key and keeps one tracking issue open, as the vendored-skill check does.
- **The skill and the README describe the new layout,** the default route with and without a key, and what replaced each 0.45.0 spelling.

### The OpenRouter models this change ships

Chosen on 2026-11-25 from each model's own description in OpenRouter's public list.

| Family | `strong` | `fast` |
|---|---|---|
| `claude` | `anthropic/claude-fable-5.2` | `anthropic/claude-opus-5.5` |
| `gpt` | `openai/gpt-6.2-astra` | `openai/gpt-6.2-sol` |
| `gemini` | `google/gemini-4-carbon` | `google/gemini-4-hydrogen` |
| `grok` | `x-ai/grok-4.7` | `x-ai/grok-4.7` |

The tools' models are unchanged.

## Non-goals

- **A direct route to each vendor's own API.** It needs a request format and a key for each of four vendors, and OpenRouter already reaches all four with one key. The layout leaves room for a third value of `via`.
- **A migration that rewrites old keys.** The ladder `ctxr update` runs is keyed by `schema_version`, so a step would raise that version for every store, to rewrite a block that none of the known stores writes. The load error names the key and its replacement.
- **Aliases for the old names.** Two spellings of one critic would stay in the schema, the help and the tests with no date on which the old one goes.
- **Renaming the manifest's `cli` field or `preflight`'s `clis`.** Their values change; the field names stay, so a manifest's reader breaks in one way and not two.
- **A route for one run.** An operator who needs a critic off OpenRouter changes the configuration, or leaves that critic out with `--only`.
- **A different quorum for four critics.** Two valid answers still make a second opinion. Whether three of four should be required is a question for a run to raise.
- **Letting a store choose which role a critic takes.** Each family keeps one role.
- **An effort setting for OpenRouter critics.** Unchanged from `second-opinion-through-openrouter`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: new requirements for the family-first lineup and `via`, the default route, the critics' names and the refusal of the 0.45.0 spellings, Grok and its role, shipped models and a written model, the route never chosen for one run, what reports say, the scheduled check, and what the skill states.

## Impact

- **Code:** `src/config/defaults.ts` (the two model tables), `src/config/schema.ts` (the lineup block and the refused keys), `src/core/second-opinion/lineup.ts` (critics, tools, roles, route and model resolution, the refusals), `modes.ts` (the lineup on this machine, `--only`, reports), `src/run.ts` (help text), `src/core/mcp/` (tool and consent text).
- **Templates:** `templates/skills/ctxr-second-opinion.md`, a new persona `templates/second-opinion/personas/verifier.md`, the tool descriptions under `templates/mcp/`, and the second-opinion plugin's texts. Skill prose stays in templates.
- **Repository:** `scripts/check-openrouter-models.mjs` and a weekly workflow beside `vendor-check.yml`.
- **Configuration:** the `second_opinion` block changes shape with no `schema_version` change and no migration. A store that wrote the 0.45.0 block fails to load until it is rewritten. No key in the block has a default.
- **Behavior on update, with no configuration change:** a machine that holds `OPENROUTER_API_KEY` and wrote no route sends every critic through OpenRouter and adds Grok. That spends the key on four requests per run where 0.45.0 spent it on none. A machine with no key runs as before.
- **Deployments:** a set `CTXR_SECOND_OPINION_CODEX_*`, `_AGY_*` or `_OPENROUTER` variable stops a second opinion with the replacement named. One passed through empty is ignored.
- **A server:** `ctxr serve` gives the key to `second-opinion` commands only, as before. A server that holds a key and serves a store with no route written runs four critics through OpenRouter, starts no tool, and so needs no confinement for it.
- **An older `ctxr`:** refuses a store that writes the new block. The release note says to update every host first.
- **Dependencies:** none added.
- **contexture-images:** a follow-up renames the model and effort variables its compose file passes to `serve`, drops the three `_OPENROUTER` ones, and updates its README. Not part of this change.
- **Tests:** the existing stub CLIs and stub endpoint.
