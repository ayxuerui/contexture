# Design

## Context

See proposal.md, Why. Current state:

- **One launcher.** Every critic is a model CLI started by `runCli` in `src/core/second-opinion/launch.ts`: an argument vector, the prompt on standard input (or one argument for `agy`), an allowlisted environment, and, where the machine allows, a fresh home under Landlock rules.
- **The lineup.** `second_opinion.<tier>.<cli>` in `contexture.yaml` holds a `model` and, for `claude` and `codex`, an `effort`. Each entry is a strict object with shipped defaults (`src/config/schema.ts`, `DEFAULT_SECOND_OPINION_LINEUP`). `lineupCell` in `lineup.ts` resolves one entry: environment first, then the store, then the shipped default, and reports which.
- **Roles are tied to entries.** `ROLE_CLI` maps architect to `claude`, skeptic to `codex`, pragmatist to `agy`. `--only` names entries by the same three words.
- **The environment allowlist.** `environment.ts` passes a model CLI only allowlisted names and prefixes. `OPENROUTER_` is not among them, so a CLI does not see that key today. The pass-through variable could still name it.
- **The server's child environment.** `childEnv` in `src/core/mcp/tools/cli.ts` drops forge credentials and passes everything else to every `ctxr` command the server runs, not only to a second opinion.
- **Three earlier changes are not yet synced into the main specs:** `second-opinion-lineup-in-store-config`, `second-opinion-start-and-fetch` and `serve-the-second-opinion-to-chat-apps`. Their requirements (the lineup, the fresh home, confinement, `--require-confinement`) are implemented. This change adds requirements beside them and modifies only a requirement the main spec already holds, so it does not depend on the order they are synced in.

## Goals / Non-Goals

**Goals:**
- **One entry, one route.** For any run, each of the three entries resolves to exactly one of its CLI or OpenRouter, before anything starts.
- **Everything after the answer is shared.** An OpenRouter answer enters the same judging, lettering, manifest and detached-run code as a CLI's.
- **The key has one home.** The command's environment, and from there only the request's authorization header.

**Non-Goals:**
- **A provider abstraction.** Two routes are an `if`, not an interface with registered implementations. A third route would be the time to design one.
- **Knowing OpenRouter's catalog.** A slug is a non-empty string. `preflight` asks OpenRouter whether it exists.

## Decisions

### D1. The route is an optional `openrouter` key on the existing entry

```yaml
second_opinion:
  strong:
    agy:
      openrouter: <vendor>/<model>
```

That is the whole of what a store writes to give the third critic a frontier model at the `strong` tier. The entry's `model` and `effort` keep their shipped defaults and are unused while `openrouter` is set.

- **Why a key holding the slug, and not `via: openrouter` beside `model`.** `model` has a shipped default that is a CLI model name (`Gemini 3.8 Flash (High)`). With `via`, an entry that set the route and forgot the model would send a CLI name to OpenRouter, and the schema would need a cross-field rule to stop it. One key that is both the switch and the slug cannot be half set.
- **Why keep the entry names.** `agy.openrouter` reads oddly, since `agy` is a tool and the route bypasses it. The entry name is also the role's seat, the `--only` name and the manifest's `cli` field. Renaming the three entries to families (`anthropic`, `openai`, `google`) would be clearer at this one point of use and is a breaking change to every store's lineup, to `--only` and to the manifest, with a raw-YAML migration behind it. That cost is out of proportion to one optional key. The skill and the configuration comment say plainly that the entry names the seat, not the route.
- **The case for a separate `second_opinion.openrouter` block.** A block keyed by tier and entry would keep the CLI entries untouched. It would also put one critic's configuration in two places, and a reader of `strong.agy` could not tell the entry is not in use.
- **No shipped default, optional.** As with every opt-in key: `.optional()`, no `SHIPPED_DEFAULTS` entry, never written by `init`.

### D2. Resolution order, per entry

1. `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` in the environment, non-empty: OpenRouter with that slug, source `environment`.
2. `CTXR_SECOND_OPINION_<CLI>_MODEL` in the environment, non-empty: the CLI with that model, source `environment`.
3. The store's `openrouter` for that tier and entry: OpenRouter, source `store`.
4. The store's or the shipped `model`: the CLI, as today.

Both of 1 and 2 set for one entry is a usage error raised before any critic starts, naming both variables.

- **Why the environment's CLI model beats the store's OpenRouter slug.** The existing rule is that the environment is the narrower scope and wins. An operator whose key has run out needs a way to put one entry back on its CLI for a run without a pull request, and step 2 is that way with no new variable.
- **Why both is an error and not "OpenRouter wins".** Either order would be a guess about intent, and a silent guess here decides where a plan is sent.
- **Effort.** `_EFFORT` and the entry's `effort` apply to the CLI route only. An OpenRouter request carries no effort (proposal, Non-goals).
- **An OpenRouter entry never reports source `default`,** since nothing ships one.

### D3. The request

One `POST` to OpenRouter's chat-completions endpoint with the runtime's `fetch`, from the command's own process:

- **Body:** the slug, one user message holding the critic's prompt, no tools, not streamed, and `provider: { data_collection: "deny" }` (D5).
- **Headers:** the authorization header and the content type. No referer or title header: those name the calling application to OpenRouter, and nothing about the store or its operator leaves in a header.
- **Timeout:** the same per-critic bound (`--timeout`, 600 seconds by default), by aborting the request.
- **Answer:** the first choice's message text, and the response's `model` field as the model reported.
- **Failure:** a non-success status (with OpenRouter's own error message, first lines only), a timeout, a network error, or empty text. Each is a failed critic with its cause.
- **No size limit of its own.** The 120,000-byte argument limit is `agy`'s; an `agy` entry routed through OpenRouter is not subject to it.

Alternatives:

- **The Vercel AI SDK with its OpenRouter provider.** It would add a dependency tree to do one request, and its community CLI providers are not a substitute for `launch.ts` and `confine.ts` (proposal, Non-goals).
- **Point a CLI at OpenRouter** (for example `claude` with a base-URL variable). It keeps one launcher, but the CLI could then act again, needs confinement again, and each tool's support for a foreign endpoint is its own moving target.
- **Streaming.** It would let a long answer survive a slow provider, but the answer is judged whole and the bound is already ten minutes.

### D4. The key

- **Read from `OPENROUTER_API_KEY`** in the command's environment, at the moment a request is built.
- **Missing key:** an entry resolved to OpenRouter is a failed critic, cause `OPENROUTER_API_KEY is not set`. In `preflight` it is `DOWN` with the same text. The run goes on with the others, and the quorum rule decides whether the result is partial.
- **Never to a model CLI.** `OPENROUTER_` joins the protected prefixes in `environment.ts`, so the allowlist drops it and naming it in `CTXR_SECOND_OPINION_PASS_ENV` stops the run with the usage code, as `GH_TOKEN` does.
- **Never written.** Not in the manifest, the raw files, standard output or error, or a detached run's folder. The raw file for an OpenRouter critic holds the response body only. A test greps every file and stream a run produced for the stub key.
- **On the server,** `childEnv` drops `OPENROUTER_API_KEY` for every command except the `second-opinion` ones (`SECOND_OPINION_COMMANDS`). Today it would reach `ctxr_write` commands running in a member's session, which have no use for it.

Why a missing key is a failed critic and not a usage error: a model CLI that is not signed in is a failed critic too, and the skill already tells the agent what to do with one. Refusing the whole run would take away the other two answers for a problem with one entry.

Why not a key file path in `contexture.yaml`: the server reads no secret and no secret's location from the store's configuration (remote-access spec), and a store's configuration is readable by everyone who can clone it.

### D5. Requests decline data collection

Every request carries `provider: { data_collection: "deny" }`, so OpenRouter routes only to providers that do not keep or train on the prompt. What goes out is a plan that can quote store content.

- **The case for leaving it to the account's own privacy settings.** OpenRouter accounts already carry that setting, and a fixed `deny` can make a slug unroutable with an error about the data policy that the operator did not ask for. Against that: the account setting is invisible from the store, and a default that leaks nothing is the one to ship. The refusal surfaces as the failed critic's cause, in OpenRouter's words.
- **This parameter is from memory of OpenRouter's provider-routing documentation.** Task 2.1 confirms its name and values against the current documentation before any code depends on it.

### D6. Confinement applies to processes

An OpenRouter critic is a request made by `ctxr` itself: no child process, no home, no login file. So:

- **`--require-confinement`** refuses a run on a machine that cannot confine only when at least one requested entry resolves to its CLI. A run whose requested entries all resolve to OpenRouter proceeds.
- **The manifest's `confined` and `confinement_reason`** keep their meaning: whether this machine confines a model CLI. They are reported as today even when no CLI ran, so the field does not change shape.
- **Each critic gains `route`:** `cli` or `openrouter`, in the manifest and in `preflight`'s entries. `preflight`'s line reads, for example, `[OK  ] agy     PONG (<vendor>/<model>, store configuration, through OpenRouter)`.
- **`preflight` for an OpenRouter entry** is the ping alone, with the tier's slug. There is no help text to check for flags.

The alternative, treating an API-only run as "confined", would make a server that cannot confine report that it can.

### D7. The endpoint can be named in the environment

`CTXR_SECOND_OPINION_OPENROUTER_URL`, when set, replaces OpenRouter's base address. The tests need it to reach a stub on localhost, and an operator whose network requires a forward gateway in front of OpenRouter can use it. The request shape stays OpenRouter's (D3, D5); this is not a route to an arbitrary provider.

The variable is the operator's. On the server, members cannot set it. It does send the key wherever it points, which is why it is an environment variable and not a configuration key a pull request could change.

### D8. What the skill and the tool description say

In `templates/skills/ctxr-second-opinion.md` and `templates/mcp/ctxr.md`, never in TypeScript:

- **Section 2 (preflight):** an OpenRouter entry is checked by a ping; `DOWN` with the key's variable name means the key is missing, and on the server that is the operator's to set.
- **The untrusted-plan paragraph:** an entry routed through OpenRouter has no ability to act and need not be left out. The advice to drop `agy` applies to `agy` the tool.
- **Section 7 (lineup):** the `openrouter` key with a placeholder slug, the environment variable for one run, and that the entry name is the seat.
- **Disclosure:** a plan sent to an OpenRouter entry goes to OpenRouter and the provider it routes to. The agent says so in its report when a critic ran that way, as it already names a critic that shares its own model family.

The skill's banned wording is checked by its existing test.

## Risks / Trade-offs

- **[A plan reaches a fourth party]** → `deny` on data collection (D5), no identifying headers (D3), the skill's disclosure (D8), and the route named in every manifest. The store opts in entry by entry; nothing is routed by default.
- **[The key leaks into a file or a log]** → it is read at request time and placed only in a header; the error path prints OpenRouter's message body, never the request; a test greps all output for the stub key (D4).
- **[Per-token cost with no ceiling]** → one request per critic per run, no retries, and the one-run-at-a-time lock still holds. A spending limit is set on the OpenRouter key itself, which the skill tells the operator.
- **[Same family twice]** → a store could route `agy`'s entry to an Anthropic slug and lose a family. The command does not check; a slug's family is not something it can know without the catalog. The manifest's reported model shows it, and the skill already has the agent name a critic whose model was not the one expected.
- **[A proxy the runtime's `fetch` ignores]** → Node's `fetch` reads the proxy variables only when told to. Task 2.4 establishes the behavior on Node 26 and the skill's failure signatures name the fix. A CLI behind the same proxy is unaffected.
- **[OpenRouter's response shape changes]** → the parsing is one function with a test over recorded responses; a shape it cannot read is a failed critic with cause `unreadable response`, never an empty valid answer.
- **[An older `ctxr` reads a newer store]** → the entry is a strict object, so a `ctxr` from before this change refuses to load a configuration carrying `openrouter`. This is the existing behavior for any new lineup key and fails loudly, naming the key. Hosts update daily; the release note says to update before a store sets it.

## Migration Plan

- **Ship in a release.** No configuration changes on update; no store is routed until it names an entry.
- **First use** is on one store: set `strong.agy.openrouter`, set the key on the host, run `ctxr second-opinion preflight --tier strong`.
- **Rollback** is removing the key from `contexture.yaml` or setting `CTXR_SECOND_OPINION_AGY_MODEL` for the run. A release rollback needs the key removed first (see the last risk).

## Open Questions

- **The exact slugs to recommend in the skill's example.** The example uses a placeholder; a release note can name the current frontier slugs without the template going stale.
