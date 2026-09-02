## Context

See `proposal.md` — Why. The gate was introduced with `session-submit-and-land`, when submit was still a
CLI command (`ctxr session submit`) that did the staging, committing, pushing, and PR-opening itself; a
confirmation before that much machinery fired made sense. `session-keeps-only-what-git-cannot-do` then
dissolved the command into skill steps an agent runs one at a time, and the gate came along unexamined.
What it now sits in front of is two individually-visible commands the operator explicitly asked for.

## Goals / Non-Goals

**Goals:**
- Remove a confirmation that has exactly one correct answer, so the confirmations that remain keep their
  signal.
- Keep the spec honest: two requirements currently assert the gate exists, and one scenario generalizes
  it to "every external side effect."

**Non-Goals:** see `proposal.md` — Non-goals (land's merge gate, reclaim's gate, and everything submit
does before the push all stay).

## Decisions

**D1 — Submit loses its gate; land keeps its.** The asymmetry is the point, so it's worth naming what
separates them rather than treating "external side effect" as one category. Submit's side effects are
requested (the operator said "submit"), individually reversible (delete the branch, close the pull
request), and aimed at a target that can't be mistaken — the branch is whatever the session has been on.
Land's are none of those: reached by a separate later decision, hard to walk back once the default branch
moves, and pointed at a target the skill requires be named explicitly *because* it is mistakable. A
category that contains both isn't a useful category.

**D2 — The lifecycle scenario is narrowed, not deleted.** It could have been dropped once it stopped
being true of pushes, but "which side effects are confirmed" is exactly the kind of thing a reader of
the spec alone needs stated. It now names the merge and the reclaim, which is what the skills actually
do, rather than asserting a blanket rule contradicted by the submit skill sitting two requirements below
it. Both this scenario and submit's keep their original headings even though the headings now read
slightly wider than what they assert — a MODIFIED delta replaces a requirement wholesale and `openspec
validate` refuses one that drops a scenario the main spec still has, and scenario-level renaming is not
an operation the schema offers. The heading is the join key; the WHEN/THEN is the claim.

**D3 — `Prompter.confirm` stays.** No code path changes: the seam exists for land's merge and the
reclaim path. Its doc comment already names those two ("a merge, a worktree removal") and never named
the push, so it needs no edit either — a small sign the gate being removed was the odd one out.

## Risks / Trade-offs

- **An agent pushes a branch the operator would have caught in the summary.** → The summary isn't what
  catches that; the re-scan in step 1 and the surgical staging in step 3 are, and both stay. A reviewer
  also still sees everything before it merges — the pull request is the review surface, which is the
  guarantee `write-lifecycle` actually makes ("nothing reaches the default branch un-gated"), and that
  guarantee is about the merge, not the push.
- **Muscle memory: an operator used to the confirmation may be surprised the first time.** → Accepted;
  the skill's own description already says it opens the pull request, and the step list is read at
  invocation time.

## Migration Plan

Additive to the delivery mechanism, not to store state: the next `ctxr update` rewrites `ctxr-submit`
in place, the same as any shipped-skill edit. No config, no schema version, no command behavior.
