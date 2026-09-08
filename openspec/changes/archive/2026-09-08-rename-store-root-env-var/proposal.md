## Why

`CONTEXTURE_ROOT` names the store root, but it reads as "the root of contexture" — and `.contexture/` *is* the contexture directory: the tool's own home inside the store, holding the catalog, published pages, guidance, and cache (`context-store`: "Tool-owned files default to one home directory"). The variable points at that directory's *parent* — the store root, where `contexture.yaml` lives as `.contexture/`'s sibling. So the more literal reading of the name is the wrong one, and the store's root and the tool's own files inside it are the two things an operator most needs to keep apart.

Adding the noun fixes it. `CONTEXTURE_STORE_ROOT` distinguishes the store from the tool's files inside it, and does so in the one place the name is read outside a context contexture supplies: the environment.

## What Changes

- **`CONTEXTURE_ROOT` becomes `CONTEXTURE_STORE_ROOT`** as the sole store-root environment variable, in root resolution for every command and for `init`.
- **The old name is recognized only to refuse.** When `CONTEXTURE_ROOT` is set and `CONTEXTURE_STORE_ROOT` is not, the command exits non-zero naming the rename. It is never resolved as a root, so the store root remains addressable by exactly one variable.
- **The `CONTEXTURE_` prefix stays; internal names stay bare.** `storeRoot`, `StoreConfig`, `NoStoreRootError`, the `--root` flag, and the `context-store` / `store-lifecycle` / `store-integrity` spec paths are unchanged — each is read inside a context contexture already supplies, where the prefix carries no information. The environment is the exception because it is one global namespace shared with every other process.
- **The project context's deferral of the root noun is retired and replaced by a naming split.** `openspec/config.yaml` currently says "Naming is deliberately postponed: the store's root noun is not yet chosen." The noun is settled as **store**, and the line is replaced by the split that governs it: every technical register names the concept `store_root`, spelled `CONTEXTURE_STORE_ROOT` in the environment and bare (`store_root` / `storeRoot`) in configuration, code, and any future flag or key — while **"knowledge store" is available as the product noun in prose**. The two registers are deliberately different, not a drift to reconcile.
- **BREAKING**: an operator with `CONTEXTURE_ROOT` exported gets a non-zero exit until they rename it. This is deliberate — see design D2. No store migration is required: nothing store-resident changes, and the generated `AGENTS.md` root-resolution paragraph is rewritten by the next `ctxr update` reconcile.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `harness-portability`: the root-resolution precedence requirement names `CONTEXTURE_STORE_ROOT` instead of `CONTEXTURE_ROOT`, and the one-variable/no-alias requirement gains the refusal behavior for the superseded name — an unrecognized variable still falls through, but the specific former name fails loudly rather than silently.

## Impact

Affected code:

- `src/core/root.ts` — the two reads in `resolveExistingRoot` and `resolveRootForInit`, plus the refusal check and doc comments
- `src/core/errors.ts` — `NoStoreRootError` message text; a new error for the superseded variable
- `src/run.ts` — `--root` help text
- `templates/agents/canonical.md` — the root-resolution rule generated into every store's `AGENTS.md`
- `README.md`, `scripts/verify-phase0.sh`
- `test/unit/root.test.ts`, `test/unit/agents-doc.test.ts` (byte-exact canonical assertion), `test/integration/no-root.test.ts`, `test/helpers/git-env.ts`
- `openspec/specs/harness-portability/spec.md`, `openspec/config.yaml`

Sequencing: the unmerged `isolate-the-portability-test` change adds `CONTEXTURE_ROOT` to a scrubbed child environment (`tasks.md`, `design.md`, and the module it describes). Landing that change first and absorbing the rename here avoids a conflict in the same lines.

Downstream: two known client stores read the variable — `readyrun-context` (2 files) and `pkm` (18 files, including a `vault_resolve.py` resolver, an ingest script, and twelve skill documents that reference `$CONTEXTURE_ROOT` independently of the CLI). Their migration is the operator's follow-up, not part of this change; the refusal behavior exists so that a half-migrated environment fails instead of resolving two different stores. `pkm` is separately standardizing on **store** as its own noun, retiring "vault" and "workspace", so that rename travels with the same pass.

## Non-goals

- **Renaming internal identifiers or spec paths** (`storeRoot`, `StoreConfig`, `NoStoreRootError`, `context-store`, `store-lifecycle`, `store-integrity`). They are already unambiguous where they are read, and a spec directory is the most expensive name in the project to change.
- **A second variable for `.contexture/`.** A `CONTEXTURE_CONFIG_ROOT` was considered and rejected: `contexture.yaml` is not in `.contexture/` but beside it, so the name would mislead; nothing resolves `.contexture/` as a unit (it is the default prefix of four independently configured keys); and `context-store` requires those locations be read from configuration so a store stays self-describing across harnesses.
- **Rewriting existing prose to say "knowledge store."** The split above permits the product noun in prose; it does not mandate a sweep of the README and project context to adopt it. Which sentences change is an editorial decision with its own diff, and no identifier depends on it.
- **Back-compatible resolution of the old name.** Honoring `CONTEXTURE_ROOT` with a deprecation warning would violate the one-variable requirement and leave the two-stores failure mode open for the length of the deprecation window.
- **Migrating the client stores.** They are separate repositories on their own release cadence; this change makes their breakage loud and documents the rename.
