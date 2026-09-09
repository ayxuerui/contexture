## Why

`submit-is-its-own-consent` removed the fire gate from `ctxr-submit` on the reasoning that "invoking it
is already the operator asking for the push and the pull request." That is sound — and the spec records
it as "without an intervening confirmation step, because the request to submit is itself the consent for
both." But the precondition that sentence leans on, *the request to submit*, is written nowhere the agent
can read it. The skill is a bare numbered list starting at "1. Re-scan"; it never says who may enter it
or when. `ctxr-session-capture`, whose consent model is far less consequential, carries a full `## When`
with anti-triggers. Submit carries none.

So an agent that decides on its own that it has finished walks straight into a procedure whose consent
model assumes it was invoked deliberately, and inherits an ungated push it was never asked for. Observed
in a real session: the operator asked for one note; the agent wrote it, loaded `ctxr-submit` unprompted,
spent roughly thirty tool calls rehearsing `doctor` / `lint` / `catalog check`, then asked "should I
commit these three files, push the branch, and open the pull request now?" — a question the removed gate
was supposed to have made unnecessary, and which the operator never answered because they were not done.
Their next message added more work. The branch was still sitting uncommitted days later.

The rendered `AGENTS.md` pulls the same way. `templates/agents/canonical.md`'s write path reads
"`ctxr session start` creates one, **then** `ctxr-submit` … pushes, and opens … a pull request" — a
pipeline every write runs to completion, not an operator-triggered step.

## What Changes

- Add a `## When` section to `templates/skills/ctxr-submit.md` naming the entry condition (an explicit
  request to wrap up, or the operator's closing signal) and the anti-triggers — chief among them that
  finishing the assigned task is not a signal. It also names the two tells of an uninvited entry:
  rehearsing `ctxr doctor` / `ctxr lint` / `ctxr catalog check` to decide *whether* to submit, and
  composing a "shall I open the pull request?" question.
- Give the numbered procedure a `## Steps` heading, so the list belongs to the procedure rather than
  reading as part of `## When`.
- Step 10 hands off with the pull request's number and url and names `ctxr-land`'s target, so landing is
  reachable without reconstructing it. Land's own gate is untouched.
- Reword the write-path paragraph in `templates/agents/canonical.md` so submit reads as operator-triggered
  while the worktree requirement stays unconditional.
- Restate the `harness-portability` requirement so the entry condition is normative rather than an aside
  inside a subordinate clause.

## Non-goals

- **Reintroducing submit's fire gate.** The gate is not what was missing; the entry condition is. Adding
  a confirmation back would restore exactly the always-yes prompt `submit-is-its-own-consent` removed,
  and would still not tell an agent whether it should be in the skill at all. Once entry requires a
  request, the ungated push is correct — this change is what makes that argument true rather than assumed.
- **Changing `ctxr-land`'s merge gate, or auto-landing after submit.** Landing stays a separate decision
  with its own explicit confirmation. Step 10 makes it cheaper to reach, not automatic.
- **Any enforcement beyond the shipped prose.** contexture cannot stop an agent from running `git push`
  itself; per this project's enforcement rule the guarantee remains "nothing reaches the default branch
  un-gated," which is about the merge. What is enforced here is that the shipped skill *states* the
  condition — checked by `test/unit/skills.test.ts`, which fails when the section is absent.
- **A `## When` for every other shipped skill.** Submit is the one whose consent model depends on an
  entry precondition. Auditing the rest is separable work with a different rationale.

## Capabilities

### Modified Capabilities

- `harness-portability`: the submit skill's contract gains the entry condition its existing no-confirmation
  clause already presumed, plus the handoff naming land's target.

## Impact

Affected code: `templates/skills/ctxr-submit.md` (new `## When` and `## Steps` headings, step 10 reworded),
`templates/agents/canonical.md` (write-path paragraph), `test/unit/skills.test.ts` (entry-condition
assertions added to the existing submit case), `test/unit/agents-doc.test.ts` (the exact-rendered-output
golden pins that paragraph verbatim). No command behavior, no config, no schema version.

Affected stores: the next `ctxr update` rewrites `ctxr-submit` and re-renders `AGENTS.md`, as for any
shipped-prose edit.
