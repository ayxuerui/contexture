## Why

`ctxr init` resolves a taxonomy, then writes `organize.archive_path: archive/` regardless of what it just resolved. Under PARA — the default profile — the store's own taxonomy declares an `archives` layer, so every PARA store is born with a config key pointing at a directory the store does not have. Nothing fails loudly; the mismatch only surfaces the first time someone archives a note and a stray `archive/` appears alongside the `archives/` layer that was supposed to receive it. `~/workspace/readyrun-context` is a live instance of exactly this.

The key itself is not the bug. Archive's destination is deliberately decoupled from taxonomy layer names so `ctxr archive` works identically under any profile — Zettelkasten declares no layers at all, and Diataxis's four are all live documentation, so neither has a retirement layer to point at. What was wrong is that init never *asked* the taxonomy, and that the key's name implied a coupling to the PARA layer that its behavior deliberately avoids.

## What Changes

- A shipped taxonomy profile may now declare its own `archiveDestination`. PARA declares `archives/`, matching the layer it already ships; Zettelkasten and Diataxis declare none and keep the `archive/` fallback. The literal stays in `src/taxonomy/profiles.ts`, the one module permitted to name a shipped layer, so `archive` remains taxonomy-agnostic and keeps reading a single config key.
- `ctxr init` seeds `organize.archive_destination` from the resolved profile, falling back to `DEFAULT_ARCHIVE_DESTINATION` for a custom taxonomy or a profile that declares none.
- **BREAKING**: `organize.archive_path` renames to `organize.archive_destination`. `_destination` states that the value is a path notes are moved *to*, rather than a name for a taxonomy layer — the reading that caused the original defect. Migration 0006 accepts the old key and renames it; separately, and only when the value still sat at the shipped default, it adopts the profile's declared destination and moves the directory if one exists. An operator-customized value is preserved verbatim.

## Non-goals

- **Deriving the destination at archive time.** `ctxr archive` continues to read one config key and never inspects the taxonomy. Making it search for a layer named "Archives" would hardcode a PARA concept into a profile-agnostic command and break the single-source-literals invariant.
- **Giving Zettelkasten or Diataxis a retirement layer.** Neither profile ships one; both keep the existing fallback.
- **Rewriting operator-chosen destinations.** A store that deliberately set some other path keeps it — the migration changes the key's spelling for everyone, and its value for no one who chose it.
- **Migrating the stores on this machine.** `~/workspace/pkm` and `~/workspace/readyrun-context` each run `ctxr migrate` in their own repos, as their own changes.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `context-organize`: renames the archive-destination config key and requires that an operator-set value survive migration untouched.
- `store-lifecycle`: a shipped taxonomy profile may declare an archive destination, and init seeds the config from it.
