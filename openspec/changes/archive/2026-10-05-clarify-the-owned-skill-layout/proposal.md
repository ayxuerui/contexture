## Why

*Contexture-owned skills are copied into the store and refreshed by update* still describes the delivered skill as
`<slug>/SKILL.md`. Since *Owned skills may carry supporting files*, a skill may also ship files beside it. The two
requirements do not contradict (the second qualifies the first), but a reader of only the first learns a layout the
shipped `ctxr-second-opinion` skill does not have.

## What Changes

- One sentence in *Contexture-owned skills are copied into the store and refreshed by update* now states the layout
  as a `<slug>/` directory holding `SKILL.md` and any supporting files the skill ships beside it, and points at
  the requirement that governs them.
- No behavior changes. This only makes the first requirement say what the code already does.

## Non-goals

- **Changing what supporting files may be or how update treats them.** That is *Owned skills may carry supporting
  files*, untouched here.
- **Touching the vendored-skill requirements,** which have their own layout (a `SKILL.md` plus a license and a
  provenance record).
- **Rewording the rest of the requirement.** Every other clause, and the one scenario, stay byte-identical.

## Capabilities

### Modified Capabilities

- `harness-portability`: the layout clause of *Contexture-owned skills are copied into the store and refreshed by
  update* names supporting files.

## Impact

`openspec/` only. No code, no template, no configuration, and no store changes. The archived change that added
supporting files is unaffected.
