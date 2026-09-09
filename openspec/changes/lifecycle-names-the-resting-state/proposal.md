## Why

`submit-states-its-entry-condition` gave `ctxr-submit` an entry condition, so an agent that opens that
skill now reads that finishing a deliverable is not a signal to submit. That fixes the skill an agent
reads *once it is already contemplating submitting*. It does not fix the document that put the idea
there.

`ctxr-session-lifecycle` is the frame — loaded at session start, describing what surrounds a session. It
has `## Start` and `## Reclaiming` and nothing in between about how a session *rests*. The only arc it
draws runs start → work → (submit, land) → reclaim, with no legitimate stopping point anywhere in it. An
agent building its model of the session from this document sees no state called "still open, nothing to
do right now," so when a deliverable lands it reaches for the only ending the frame offers.

That asymmetry is what produced the original failure: submit was reachable by inference from the frame,
and stopping was described nowhere. Naming the entry condition on submit closes one direction. Naming the
resting state on the frame closes the other, and it is the one an agent reads first.

Separately, `ctxr-upgrade`'s step 6 ends "Follow `ctxr-submit`, then `ctxr-land`", which reads as one
continuous run. Land's own confirmation still fires, so this is not a bypass — but a shipped skill should
not describe landing as the back half of submitting when every other surface treats it as its own decision.

## What Changes

- Add a `## Between turns` section to `templates/skills/ctxr-session-lifecycle.md`, placed after `## Start`
  so it is read as part of the frame rather than as an epilogue: the worktree persists across exchanges;
  ending a turn with uncommitted work on the branch is the normal resting state; nothing but an operator
  request ends the session, and delivering the requested thing is not that request.
- Reword `templates/skills/ctxr-upgrade.md` step 6 so submitting the re-render and landing it read as two
  decisions rather than one sequence.
- Restate the `harness-portability` requirement's lifecycle clause to include the resting state, with a
  scenario.

## Non-goals

- **Repeating submit's entry condition in the lifecycle skill.** The frame points at it; the condition
  itself stays in the skill that owns it. Two copies of a rule drift, and the lifecycle skill's stated
  contract is to reference submit and land without repeating their steps.
- **Adding a resting-state section to any other skill.** Lifecycle is the frame; the others are
  procedures invoked inside it, and a procedure that has been entered deliberately does not need to be
  told it may stop.
- **Changing `ctxr-land`'s gate, or what `ctxr-upgrade` actually does.** The upgrade change is wording;
  its steps, ordering, and approval gate are untouched.

## Capabilities

### Modified Capabilities

- `harness-portability`: the lifecycle skill's contract gains the session's resting state alongside start,
  re-scan, conflicts, sequencing, and reclaiming.

## Impact

Affected code: `templates/skills/ctxr-session-lifecycle.md` (new section),
`templates/skills/ctxr-upgrade.md` (step 6 wording), `test/unit/skills.test.ts` (resting-state assertions
added to the existing lifecycle case). No command behavior, no config, no schema version.

This change's spec delta is layered on `submit-states-its-entry-condition`'s, which is merged but not yet
archived: both modify the same requirement, and a MODIFIED delta replaces a requirement wholesale, so this
one carries that change's text plus the lifecycle clause. Archiving them in either order yields the same
result.

Affected stores: the next `ctxr update` rewrites both skills, as for any shipped-prose edit.
