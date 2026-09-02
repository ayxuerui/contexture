## Why

`ctxr-submit` is a skill whose entire stated purpose is "end a working session … and open the reviewed
pull request." Invoking it is already the operator asking for the push and the pull request. Step 8 then
asks a second time — "present the branch, the title, and what rides it; wait for an explicit go" — which
in practice means the operator says "submit", reads a summary they just asked for, and says "yes" again
before anything happens.

That second ask buys nothing. A gate is worth its friction when it stands between the operator and an
outcome they did not specifically request — `ctxr-land`'s merge gate is a real example, since landing is
reached by a different decision than submitting, is far harder to walk back, and the skill's own target
may have been named wrong. Submit's isn't like that: the push and the PR-open *are* the thing that was
asked for, they are individually reversible (a branch can be deleted, a pull request closed), and
nothing between the request and the push changes what the operator already decided. A confirmation step
that only ever gets one answer trains everyone to answer it without reading, which is worse than not
having it — it makes the gates that do matter cheaper too.

## What Changes

- Drop the fire gate from `ctxr-submit`: after committing and naming the branch, the skill runs
  `git push` and `gh pr create` directly, with no intervening confirmation step.
- **`ctxr-land`'s merge gate is unchanged** — see Non-goals.
- Restate the two `harness-portability` requirements that pinned the submit gate so they describe what
  the skill now does, and narrow the lifecycle scenario's "every external side effect is confirmed"
  claim to the merge, which is the one that still is.

## Non-goals

- **Removing `ctxr-land`'s merge gate.** Merging is reached by a separate decision from submitting, is
  the step that actually puts work on the default branch, and the land skill can be pointed at the wrong
  pull request in a way submit cannot be pointed at the wrong branch. Its gate stays, along with the
  `Prompter.confirm` seam behind it.
- **Removing any other confirmation in the session lifecycle.** Worktree reclaiming (and especially the
  forced, discards-unmerged-work variant) keeps its explicit go; those destroy work rather than publish
  it.
- **Changing what submit does before the push.** The re-scan, the single capture pass, surgical staging,
  `ctxr doctor`, the commit, and the branch rename are all untouched — this removes one step, it does
  not loosen the validation ahead of it.

## Capabilities

### Modified Capabilities

- `harness-portability`: the submit skill's contract no longer includes gating the external side effect,
  and the shipped-skills scenario that claimed a push and a pull-request open are each confirmed now
  claims that only of the merge.

## Impact

Affected code: `templates/skills/ctxr-submit.md` (step 8 removed, later steps renumbered),
`test/unit/skills.test.ts` (the guard asserting the fire-gate sentence is replaced by one asserting the
push and pull-request open follow the branch rename directly). No command behavior, no config, no schema
version. `src/prompt/prompter.ts`'s `confirm` seam is untouched — it serves land's merge gate and the
reclaim path, neither of which changes.

Affected stores: the next `ctxr update` rewrites `ctxr-submit` in place, as it does for any shipped-skill
edit.
