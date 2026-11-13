# Design

## Context

See proposal.md, Why. Current state:

- **The table.** `tiers()` in `src/core/second-opinion/lineup.ts` holds the lineup: for `strong` and `fast`, a model for `claude`, `codex` and `agy`, an effort for `codex` (`low`), and no effort for `claude` (left to Claude Code). `agy` carries its effort in the model name. Each cell reads `CTXR_SECOND_OPINION_<CLI>_<MODEL|EFFORT>` first, and one variable covers both tiers.
- **The command reads no store.** `src/commands/second-opinion.ts` declares `store: 'absent'`. Through the server, `secondOpinionTool` (`src/core/mcp/tools/cli.ts`) runs it in a temp folder and sets `CONTEXTURE_STORE_ROOT` to that folder.
- **Configuration defaults.** Every convention key holds its default on the schema, reading `SHIPPED_DEFAULTS` (`src/config/defaults.ts`). `renderStoreConfig` omits a value equal to its shipped default. `single-source-literals.test.ts` requires every `.default()` in the schema to read `SHIPPED_DEFAULTS`. The root schema passes unknown keys through.
- **`store: 'optional'` exists.** `plugin build` uses it: the store is opened when one is found.
- **contexture-images #102** (merged 2026-11-13) passes the five environment overrides to `serve`.

## Goals / Non-Goals

**Goals:**
- **One copy of the lineup,** on the configuration schema, which a store overrides key by key.
- **Same resolution in a shell and on the server:** environment, then the store, then the shipped default.
- **A reader can tell why a model was asked for** from `preflight` or the manifest alone.

**Non-Goals:**
- **A lineup the server reads from a session.** Only the served commit's.
- **Validating model names.** contexture does not know a vendor's catalog; `preflight` asks the CLI.

## Decisions

### D1. The lineup is a `second_opinion` block, tier first, then CLI

```yaml
second_opinion:
  strong:
    agy:
      model: Gemini 3.8 Flash (High)
```

That is the whole of what a store on a narrower `agy` account writes. The full shape, with today's values as the shipped defaults:

| Key | `strong` | `fast` |
|---|---|---|
| `claude.model` | `fable` | `opus` |
| `claude.effort` | none (optional) | none (optional) |
| `codex.model` | `gpt-6-astra` | `gpt-6.1-sol` |
| `codex.effort` | `low` | `low` |
| `agy.model` | `Gemini 4 Argon (Medium)` | `Gemini 3.8 Flash (High)` |

- **Tier first,** because that is how a run is asked for (`--tier fast`) and how the tiers differ: in model only.
- **`claude.effort` is `.optional()` with no shipped default.** Its absence means "Claude Code's own default for the model", which is a different thing from any value. This is the existing `context-store` rule for a key whose absence is meaningful.
- **`agy` has no `effort` key.** Its effort is part of the model name, and a key the command would ignore is a trap. The schema refuses it.
- **Each object is strict** (unknown tier, CLI or field fails to load), unlike the pass-through root, so a typo is caught by `readConfig` and not by a model CLI three minutes later.
- **The block is `.prefault({})`,** like every block whose keys all have defaults. `renderStoreConfig` then omits it for a store that names nothing. It is not an opt-in block, so the `.optional()` rule for those does not apply.

**Opposing case: CLI first, then tier** (`second_opinion.agy.strong.model`). It reads well for the case in hand, where one CLI is the odd one out. It loses when a store wants a whole tier cheaper, and it splits the "tiers differ in model only" fact across three places. Tier first keeps one tier's lineup readable in one block.

**Opposing case: one model per CLI, no tiers in configuration** (`second_opinion.agy.model`), as the environment variables do. It is the smallest key. But it would make `--tier fast` and the default identical for that CLI whenever a store names a model, and a store could not say "my account lacks the `strong` model only", which is exactly the case that prompted this.

### D2. The defaults move to the schema; the code table goes

`SHIPPED_DEFAULTS.second_opinion` holds the table above, and `tiers()` is replaced by a resolver that takes the environment and the resolved block (the store's, or the schema's parse of `{}` outside a store). No second literal of any model name remains in `src/core/second-opinion/`.

**Opposing case: keep the table in `lineup.ts` and make every configuration key optional, falling back to the table at the point of reading.** It keeps vendor names out of `src/config/`, and the second-opinion code stays self-contained. It is the shape the `context-store` requirement forbids: "a component SHALL NOT substitute its own fallback at the point of reading a key the schema could have defaulted — one key, one declared default, in one place". It would also hide the defaults from anything that reads the resolved configuration.

**What it costs:** `src/config/defaults.ts` now names vendor models. D6 of the October change counted that against a configuration key. It is the price of the store being able to see and override them, and the names were always shipped code.

### D3. Environment, then store, then shipped default; and the source is reported

- **Order.** A non-empty `CTXR_SECOND_OPINION_*` variable wins, for both tiers, exactly as today. Otherwise the store's value. Otherwise the shipped default. An empty variable is unset, as today, which matters because contexture-images passes them blank.
- **Source.** Each resolved cell carries `environment`, `store` or `default`. `preflight` prints it beside the model (`PONG (fable, shipped default)`; a CLI that is down ends `[asked for <model>, store configuration]`), and the JSON envelope and the critique and poll manifests record it per CLI as `model_asked` and `model_source`. The source is the model's; an effort is not reported separately. A store's value equal to the shipped default reports `default`: the loaded configuration cannot tell the two apart, and nothing depends on the difference.

**Opposing case: the store wins over the environment.** The store's value was reviewed; a variable was not. But the environment is the narrower scope (this run, this machine) and every other override in contexture and in the model CLIs themselves resolves narrow-over-wide. It is also what lets one member with a fuller account, or one deliberate `max` run, differ without a pull request.

**Opposing case: drop the environment variables** (proposal.md, Non-goals). Rejected there.

### D4. The command takes an optional store

`requires` becomes `{ store: 'optional' }`, resolved as `plugin build` resolves it. With a store, the lineup comes from its loaded configuration; without one, from the schema's defaults.

- **A store that cannot be loaded refuses the command,** as it refuses every other: a newer `schema_version`, or an invalid lineup. Running on the shipped defaults there would quietly ignore what the store said.
- **What it costs:** inside a store at an unsupported schema version, a second opinion no longer runs until the store is updated. Outside any store nothing changes.

**Opposing case: stay `store: 'absent'` and read only the one block from `contexture.yaml` by hand.** It would keep the command independent of the schema gate. It would also be a second reader of the configuration file, with its own idea of where the root is and what valid means.

### D5. Through the server, the root is the served store

`secondOpinionTool` keeps the temp folder as the working directory and for the input file, and sets the child's `CONTEXTURE_STORE_ROOT` to the served checkout, not the temp folder.

- **Always the served commit, even when the call names a session.** A session is unreviewed. Its configuration naming a model would be an argument to a model CLI, on the server, that no reviewer saw. `ran_against` still reports the session, as it does today for the argument check.
- **The lock.** The command runs outside the view's read lock (the run takes minutes). It reads `contexture.yaml` once, at start. A sync that rewrites the checkout in that instant can make that read fail; the command then exits with a configuration error before any model CLI starts, and the member retries. Checked at apply: the view is one worktree at a fixed path that a sync moves by forced checkout under the write lock, so there is no per-snapshot root to pass and the window stays. It is one small file read at process start.

**Opposing case: the server resolves the lineup and passes it down as environment variables.** No second read of the checkout, and no lock question. But the variables are one-per-CLI across both tiers, so the server would have to know the tier being run, and the source would always read `environment`. It also puts lineup logic in the MCP layer, which an existing test keeps out of it.

### D6. The skill says where the lineup lives

`templates/skills/ctxr-second-opinion.md` replaces "Nothing about the lineup lives in the store's configuration" with: the store's `second_opinion` block is where a lasting choice goes, by a session and a pull request; the environment is for one run. Its step for a CLI that `preflight` reports down gains the case seen here: a signed-in CLI that rejects the model, which is the store's lineup to change. It stays free of the seven tier words and of flag attribution. The plugin is regenerated.

## Risks / Trade-offs

- **[A store pins a model name that the vendor later retires]** → `preflight` names the CLI, its reason and that the model came from the store, so the fix is visible. A store that names nothing never has this.
- **[A store's reviewed pull request picks a weak model for a critic]** → It is a reviewed change to the store, like any other, and the manifest records the model each CLI reports having run.
- **[An older `ctxr` runs in a store that names a lineup]** → The root schema passes the block through, so it loads and uses its own table. `preflight` there reports the older behaviour. Nothing is written.
- **[The config read races a sync on the server]** → One read at start; a failure is a clean configuration error before anything is spent (D5).
- **[A second opinion stops working inside a store at an unsupported schema]** → Accepted (D4). Every other command already stops there, and `ctxr update` is the fix.
- **[Vendor names in `src/config/defaults.ts` drift]** → They drifted in `lineup.ts` too. One place, one release, and stores that named nothing follow.

## Migration Plan

1. **Release.** No `schema_version` change and no migration step. Stores that name no lineup behave as before.
2. **A store on a narrower account** adds its lines by a session pull request once the containers that run its second opinion have the release. Until then the environment override keeps working, in a shell and (contexture-images #102) in `serve`.
3. **Rollback.** A patch release restores the table; a store's `second_opinion` block is then ignored by the pass-through root and can stay.
