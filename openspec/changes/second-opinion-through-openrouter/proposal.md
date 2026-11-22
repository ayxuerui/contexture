# Proposal

## Why

A second opinion reaches each model family only through that family's command-line tool on a signed-in account, so which model a critic runs depends on the account's plan. On 2026-11-13 `agy` was refused on every default run for accounts not offered `Gemini 4 Argon`, and the shipped `strong` default dropped to `Gemini 3.8 Flash (High)`: the third critic is now a workhorse model at the tier meant for frontier ones. OpenRouter serves the frontier model of all three families behind one key, with no plan gate and no sign-in to expire. It is also the only clean way for a server shared by many members to pay for the models it calls.

## What Changes

- **A lineup entry may name an OpenRouter model.** Each entry of `second_opinion.<tier>` (`claude`, `codex`, `agy`) gains an optional `openrouter` key holding a model slug. When it is set, that critic is answered by one request to OpenRouter and its CLI is not started. The key has no shipped default: a store that names none runs exactly as today.
- **One run can be routed from the environment.** `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` names a slug for one entry in both tiers. `CTXR_SECOND_OPINION_<CLI>_MODEL` in the environment still wins over the store and puts that entry back on its CLI for the run. Setting both for one entry is a usage error.
- **The key lives in the environment only.** The command reads `OPENROUTER_API_KEY`. It is never read from `contexture.yaml`, never passed to a model CLI, and never written to a manifest, an answer, a log or a run folder. An entry routed through OpenRouter with no key set is a failed critic that names the variable.
- **An OpenRouter critic cannot act.** The request carries the prompt and no tools. It starts no process, so it needs no fresh home and no confinement, and `--require-confinement` refuses a run only when a model CLI would start.
- **No fallback.** A refused slug, an error from OpenRouter, a timeout or an empty answer is a failed critic with its cause. The command does not try the entry's CLI in its place.
- **Reports name the route.** `preflight` pings each OpenRouter entry with its tier's slug, and `preflight` and the manifest say for each critic whether it ran through its CLI or through OpenRouter.
- **The server gives the key to a second opinion only.** `ctxr serve` passes `OPENROUTER_API_KEY` to the `second-opinion` commands it runs and to no other command.
- **The skill says so.** `ctxr-second-opinion` states that an OpenRouter entry sends the plan to OpenRouter and the provider behind it, how a store names one, where the key goes, and that such an entry need not be left out for a plan from someone else.

Nothing downstream changes: the three roles, the anonymized letters, the blind check, the quorum of two, the detached run and its bounded fetch all work on the answers as they do now.

## Non-goals

- **Replacing the CLIs, or shipping an OpenRouter default.** A shipped default has to run with no key on any signed-in account, and for one operator the subscriptions already paid for are the cheaper route. The CLIs stay the default and the only route a new store has.
- **Other gateways or direct provider keys.** OpenRouter reaches all three families with one key. A second API route is new configuration and new failure modes with no user asking for it.
- **A model SDK or a provider library.** The route is one HTTPS request. The libraries that also wrap the CLIs do not carry the fresh home, the Landlock rules or the environment allowlist this command depends on, and none covers `agy`.
- **A fourth critic, or a different roster.** The roles, the lettering and the quorum assume three entries. Changing that is a separate decision about the critique itself.
- **Lifting the one-run-at-a-time rule.** A mixed lineup still starts model CLIs, and the lock is per machine user for that reason. Running API-only lineups side by side is its own change.
- **A second-opinion-only scope, tools or plugin over MCP.** That is an access decision for `remote-access`, proposed separately. This change is the route it would stand on.
- **An effort setting for OpenRouter entries.** Effort stays each provider's own default, as it is for `claude` today. It can be added when a run shows it is needed.
- **Retries.** One request per critic. A rate limit or an outage is a failed critic, reported, as a CLI that exits non-zero is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: the second-opinion requirement says each critic is backed by a model family's command-line tool, and that the command is the only one that invokes a model CLI. Both widen to cover an entry routed through OpenRouter. New requirements cover the `openrouter` lineup key and its environment override, the request itself, the key's handling, the route in reports, and what the skill states.
- `cli-contract`: `--require-confinement` refuses only a run that would start a model CLI.
- `remote-access`: the server passes the OpenRouter key to `second-opinion` commands and to nothing else it runs.

## Impact

- **Code:** `src/config/schema.ts` (the optional key), `src/core/second-opinion/` (`lineup.ts` route resolution, a new request module, `modes.ts` wiring for preflight, critique, poll and the detached-run validation, `environment.ts` protected prefixes), `src/core/mcp/tools/cli.ts` (the child environment), `src/commands/second-opinion.ts` (help text).
- **Templates:** `templates/skills/ctxr-second-opinion.md` and `templates/mcp/ctxr.md`. Skill prose stays in templates.
- **Configuration:** one optional key per lineup entry. No `schema_version` change and no migration: a store without the key parses and runs unchanged.
- **Dependencies:** none added. The request uses the runtime's own `fetch` (Node 26 is already required).
- **Network:** the command makes its first outbound request of its own. Until now only the model CLIs did.
- **Data leaving the machine:** a plan or question sent to an OpenRouter entry goes to OpenRouter and to the provider it routes to, a party the CLI route does not involve.
- **contexture-images:** a follow-up there passes `OPENROUTER_API_KEY` and the three `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` variables to `serve`, as images #102 did for the five lineup variables. Not part of this change.
- **Tests:** stub CLIs as today, plus a stub HTTP endpoint on localhost that records each request.
