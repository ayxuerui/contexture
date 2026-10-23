## Why

`ctxr-circleback` (circleback-sweep, released in 0.30.0) sat beside `ctxr-capture` rather than inside it. Neither
skill named the other. An agent asked to capture one meeting followed the generic procedure and could write a
Circleback record by hand, skipping the tag routing. The two stores' house conventions needed a pointer to close
that gap. The Circleback skill also restated capture rules (record versus summary, the speaker caveat), so the same
judgment lived in two places.

The operator's model is one capture procedure, in which the Circleback skill only does retrieval.

## What Changes

- **`ctxr-capture` step 1 delegates retrieval.** When the store ships a `ctxr-capture-<source>` skill for the
  material's source, capture retrieves through it, then continues from step 2 with the record it wrote. The sentence
  names no source, so the capture skill stays source-neutral and its check still passes.
- **The speaker rule in `ctxr-capture` step 2 widens** to cover generic labels and a source's summary assigning
  positions to the wrong person. That was the judgment the Circleback skill carried itself.
- **`ctxr-circleback` becomes `ctxr-capture-circleback`**, the capture family's retrieval step for Circleback:
  - It runs the runner, then hands each retrieved record to `ctxr-capture` from step 2.
  - Interactively, capture's own hand-off to ingest follows. In a scheduled run it stops at a review pull request.
  - Its own judgment rules go. The runner is unchanged except for its name, its worktree path and one report label.
- **A store that opted in on 0.30.0** has `ctxr-circleback` removed and `ctxr-capture-circleback` written by its next
  `ctxr update`, through the existing sync of managed skills.

## Non-goals

- **Changing what the runner decides or writes.** Routing, presence, locked detection and the record format are
  as before.
- **Renaming the `circleback` config block.** It describes the store's routing, not the skill.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: the capture skill's retrieval delegation, the opt-in requirement's scenarios, and the
  Circleback skill's name and role.

## Impact

- `templates/skills/ctxr-capture.md`.
- `templates/skills/ctxr-capture-circleback.md` and `templates/skills/ctxr-capture-circleback/sweep.mjs`, renamed
  from `ctxr-circleback`.
- `src/core/skills.ts` (`CAPTURE_CIRCLEBACK`), `src/config/schema.ts` (comment).
- Tests and the README.
- **Downstream:**
  - contexture-images' `ctxr-install-circleback-script` follows the new directory name.
  - The stores' Hermes jobs switch to `--script ctxr-capture-circleback/run.sh --skill ctxr-capture-circleback`.
  - The stores' house-convention pointer becomes unnecessary.
