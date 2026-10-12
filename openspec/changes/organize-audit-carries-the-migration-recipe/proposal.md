## Why

pkm's own `organize` skill, 50 KB, mostly duplicated `ctxr-organize-audit`. What it alone carried was how to run a
folder migration safely: snapshot unrelated work first, preflight for hardcoded paths and path-qualified
wikilinks, stage surgically against the snapshot, and log the result. None of that is specific to pkm, so it
belongs in the shipped skill, and the store's skill can then retire.

## What Changes

- `ctxr-organize-audit`'s "Moves at scale" section becomes a five-step migration recipe:
  1. snapshot unrelated work, don't abort;
  2. preflight grep for old prefixes and path-qualified wikilinks, and `ctxr doctor` for ambiguous links;
  3. two commits, never a broken intermediate;
  4. surgical staging against the snapshot;
  5. rebuild, lint, doctor, and log.

## Non-goals

- **A preflight command.** The checks are a grep and an existing `ctxr doctor` check; pkm's preflight script
  retires with its skill.
- **Classifying broken links beyond `ctxr lint`.** pkm's scanner distinguished URL-wrapped links and name
  collisions, but its store had essentially none.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: the organize-audit skill carries the migration recipe.

## Impact

- `templates/skills/ctxr-organize-audit.md`, plus one test in `test/unit/skills.test.ts`.
- Downstream: pkm's `organize` skill retires.
