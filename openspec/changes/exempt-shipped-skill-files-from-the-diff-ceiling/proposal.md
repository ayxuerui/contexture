## Why

The pre-commit hook refuses any commit whose staged diff exceeds `write_lifecycle.diff_size_ceiling_lines`
(default 2000). Its purpose is to stop an agent's runaway edit from reaching review as one unreadable change.
It cannot tell an agent's edit from contexture's own write, and contexture writes a lot: `ctxr init` stages the
whole store in one commit, and `ctxr update` can stage several releases of refreshed skills in another.

Measured on a fresh `ctxr init` against `main` plus the second-opinion skill (PR #124): **2660 changed lines**,
over the ceiling, so the store's own bootstrap commit is refused and `ctxr init` fails. The baseline was already
about 1880, with only about 120 lines of headroom. By path:

| What | Changed lines |
| --- | ---: |
| The 15 existing owned skills' `SKILL.md` | 985 |
| The new `ctxr-second-opinion` skill and its runner | 783 |
| Vendored skills (`frontend-design`'s `LICENSE.txt` alone is 177) | 386 |
| `AGENTS.md` | 209 |
| Note templates | 134 |
| Everything else | 163 |

Nothing in the first three rows is an agent's edit: each is bytes contexture ships, written by `init` or
`update` (apart from two small generated provenance records, 17 lines, which stay counted). The shipped files are
2,137 of the 2,660 lines, leaving about 520 that are counted. Every skill added from here on makes it worse, so this
is a ceiling that the product's own growth will keep hitting, not a one-off.

## What Changes

- The staged diff-size ceiling no longer counts a file under the configured skills path whose **staged content
  is byte-identical to what the installed contexture version ships for that path**: an owned skill's `SKILL.md`,
  an owned skill's supporting file, or a declared vendored skill's packaged file.
- The test is identity with shipped bytes, not location. A file under the skills path that differs by a single
  byte from what contexture ships, an operator-authored skill, a file contexture does not ship, and every
  deletion all count exactly as before.
- Everything else about the check is unchanged: the ceiling, its default, its configuration key, and the failure
  message, which now says how many lines were left out of the count so a refusal is still explicable.

## Non-goals

- **Raising the default ceiling.** That weakens the runaway-edit guard for every new store in order to absorb
  content that is not an edit at all, and it only postpones the next skill that tips it over (design D2).
- **Exempting the skills path by prefix.** A prefix would let an agent stage unlimited lines under it unseen. The
  byte-identity test closes that, and costs one comparison per staged file (design D1).
- **Exempting `AGENTS.md`, the note templates, the catalog, or the adapter outputs.** They are also
  tool-written, but each carries or sits beside operator-authored content, and together they are about 500 lines,
  well inside the ceiling. Widening the exemption without a measured need is how it becomes a hole.
- **Special-casing `ctxr init`'s first commit.** It would leave `ctxr update` unprotected against the same
  problem, and needs a signal that anyone can set (design D3).
- **A configuration key to turn the exemption off.** There is nothing to configure: a store that wants the old
  behavior has no content the exemption would ever apply to except contexture's own.

## Capabilities

### Modified Capabilities

- `write-lifecycle`: the pre-commit validation's diff-size ceiling does not count staged files that are
  byte-identical to the skill files the installed version ships.

## Impact

Affected code: `staged.diff_size_ceiling` in `src/core/checks/write-lifecycle-checks.ts`, plus a function in
`src/core/skills.ts` that answers "what bytes does this version ship for this path under the skills path", built
on `renderSkills` and the vendored payload reader that already live there. Tests: the ceiling check gains its
first direct tests (today none exist), and the integration suite that runs `ctxr init` is the end-to-end proof.

Affected stores: a store gains headroom and loses nothing. A commit that passed before passes now. A commit
that was refused for size is accepted only where the lines left out are contexture's own shipped bytes. No
configuration key, schema version, or migration changes.

Unblocks: PR #124 (`ctxr-second-opinion`), which cannot merge while `ctxr init` fails.
