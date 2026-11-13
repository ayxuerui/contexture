## Why

The first PKM sweep on 0.39.0 (2026-11-13) retrieved 21 meetings into 20 files. A record's file is named for the
meeting's date and a slug of its title, and the slug keeps only ASCII letters and digits. Two meetings on 2026-10-30,
"AON 检索算法优化方案讨论" and "AON 推荐召回率优化方案", both reduced to `circleback-2026-10-30-aon.md`, so the second
record silently overwrote the first. The next run would retrieve the lost meeting again, but could then overwrite the
other one's record, which by then is committed on the review branch.

## What Changes

- **A record never overwrites another.** When a record's name is already taken in the inbox, whether by a file
  written this run or one already there, the runner adds the meeting id to the name. Other names are unchanged.

## Capabilities

### Modified Capabilities
- `harness-portability`: the Circleback runner writes each record to a file of its own.

## Impact

- `templates/skills/ctxr-capture-circleback/sweep.mjs`.
- `test/integration/circleback-sweep.test.ts`.
- This change modifies the requirement that `capture-circleback-sees-local-worktrees` and
  `capture-circleback-survives-rate-limits` also modify, and builds on their text; sync those first, in that order.
