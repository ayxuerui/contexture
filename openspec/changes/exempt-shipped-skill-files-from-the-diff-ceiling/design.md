## Context

See `proposal.md` — Why, for the measurement. The ceiling is `staged.diff_size_ceiling`
(`src/core/checks/write-lifecycle-checks.ts`): it sums `addedLines + removedLines` over `ctx.staged`, the files
`git diff --cached --numstat` reports, and fails above `write_lifecycle.diff_size_ceiling_lines`. Each staged
file already carries its staged `content` (read with `git show :<path>`, capped at 2 MB), which is what makes a
content test cheap. `renderSkills(config)` produces every owned skill's bytes and, since PR #122, its supporting
files; the vendored payload reader in `src/core/skills.ts` produces the vendored ones. Both are what `init` and
`update` write.

The ceiling has no direct tests today: the only references are fixtures that set the number.

## Goals / Non-Goals

**Goals:**
- `ctxr init` and `ctxr update` never fail the ceiling on account of files they themselves write.
- The ceiling keeps doing its job on everything an agent or operator can author.
- A refusal remains explicable: the message says what was and was not counted.

**Non-Goals:** see `proposal.md` — Non-goals.

## Decisions

**D1 — Exempt by byte-identity with shipped content, not by location.**
A staged file is left out of the count when it sits under the skills path and its staged content equals what the
installed version ships for exactly that path.

*The case for exempting the whole skills path by prefix:*
- It is a few lines and needs no skill rendering inside a check.
- The path gate already treats the skills path as a "contexture-owned location".
- An agent has no business writing there anyway.

*Against:*
- The ceiling exists to bound what an agent can stage unreviewed. A prefix exemption removes that bound for an
  entire directory, and agents *do* write skills (that is how a store grows its own); a 5,000-line skill would
  sail through.
- "Contexture-owned" in the path gate means *sanctioned to write*, not *written by contexture*. Borrowing it
  here would conflate the two.
- Identity with shipped bytes is the property that actually justifies the exemption: those lines carry no
  review value because they are bytes a reviewer already reviewed in the contexture release. A one-byte
  difference means a human or agent did something, and that is exactly what the ceiling should see.

*Cost of the stricter test:* the check renders the shipped skills (a handful of cached template reads) and
compares strings. The staged content is already in memory.

*Flip condition:* evidence that rendering inside the hook is too slow or too fragile to keep. Then the fallback is
the prefix exemption, with the hole named in the spec.

**D2 — Not a higher default.**
The default is a heuristic someone picked when `init` staged a fraction of what it does now.

*The case for raising it:* one constant, no mechanism, and existing stores keep the 2000 already in their
config, so nothing changes under anyone.

*Against:*
- It weakens the runaway-edit guard for every *new* store to absorb content that is not an edit, and every
  store that wants the guard back has to lower it again.
- It only postpones the problem: the headroom was 120 lines, and each new skill spends it. Whatever number is
  chosen is overtaken by the product's own growth, which is the one input the number cannot see.
- Stores that already exist keep 2000, so the stores most likely to update across several releases and stage a
  big refresh would still hit it.

*Flip condition:* a measured case where the byte-identity test cannot apply (shipped content the check cannot
reproduce), which would leave only a bigger number.

**D3 — Not a bootstrap-only exemption.**
*The case for it:* narrowest change, and the first commit is the one that fails today.

*Against:* `ctxr update` stages the same kind of diff. A store that updates across several releases adds every
skill released since in one commit, and would hit the ceiling for the same reason; a bootstrap-only exemption
leaves that path broken. It also needs a signal from `init` to the hook (an environment variable or an
argument), which anyone can set, so it is a bypass with extra steps.

**D4 — Vendored skills are in, the provenance records are out.**
A vendored skill's packaged files (`SKILL.md`, `LICENSE.txt`) are byte-copied by `update` and compare cleanly.
The `.ctxr-vendored.json` record is generated per store (it carries the installed CLI version), so it cannot be
compared with a packaged file and keeps counting. It is 8 to 9 lines each.

**D5 — Say what was left out.**
The ceiling's failure message gains the number of lines left out of the count. A refusal that says "2,300 changed
lines" when the diff stat says 4,400 would send the reader to the wrong conclusion; saying "(2,137 more lines are
shipped skill files, not counted)" costs one clause.

**D6 — Only added and modified files qualify.**
A deletion has no staged content to compare, and removing an owned skill file is a change a reviewer should see
the size of. It counts as before.

## Risks / Trade-offs

- **The check now depends on the skills module.** → It calls one function, `renderSkills` plus the vendored
  reader, both already pure with respect to the config. The check's tests render with the same fixtures `skills`
  tests use, so the two cannot drift.
- **Version skew between the hook's CLI and the one that wrote the files.** A store refreshed by a newer
  release and then committed by an older one stages files that do not match the older version's package. →
  They simply count, which is the conservative direction. The release sequence already forbids running an older
  CLI against a store refreshed by a newer one.
- **An agent copies shipped bytes to a new path under the skills path.** → The comparison is by *path*: shipped
  content at an unshipped path does not match, so it counts.
- **The exemption hides how big a commit really is.** → The message states the count left out (D5).

## Migration Plan

Additive and behavior-widening only. No configuration key, schema version, or migration. Rollback is reverting
the check; nothing is written to a store on account of this change.

## Open Questions

- Should the same test later cover the note templates `init` installs (134 lines)? They are tool-written but sit
  in a directory operators add to, and the measured need is zero today, so it is deliberately left out.
