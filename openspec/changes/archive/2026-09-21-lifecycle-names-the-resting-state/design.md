## Context

The failure that produced `submit-states-its-entry-condition` was an agent submitting mid-conversation
after delivering the one thing it had been asked for. That change gave submit an entry condition. Reading
the reported session again with the fix in hand, the entry condition would have caught it — but only at
the moment the agent opened the submit skill, which was already several steps into the wrong behavior: the
todo list written at the very start of the session had "run lint/doctor verification" in it. The intent to
submit was formed before any skill was consulted.

Where that intent comes from is the lifecycle skill, which is loaded at session start and is the only
document describing the shape of a session. It names a beginning and a cleanup and nothing in between.

## Goals / Non-Goals

**Goals.** Give the frame a resting state, so "session still open, nothing to do" is a state an agent can
name. Keep the entry condition single-sourced in submit.

**Non-goals.** Repeating submit's rule in the frame. Touching land's gate or the upgrade procedure's
steps.

## Decisions

**D1 — The section goes in the frame, not in another procedure.** Procedures are read when an agent has
already decided to do the thing they describe; by then the decision under repair has been made. The
lifecycle skill is the one document read *before* any of that, and it is where a model of "what a session
is" gets built. Putting the resting state anywhere else would be arriving after the fact, exactly as
submit's entry condition does on its own.

**D2 — Placed after `## Start`, not at the end.** Ordering is meaning in a document read top to bottom.
After `## Start` it reads as the state a session is in most of the time; after `## Reclaiming` it reads as
an epilogue about winding down, which is the opposite of the point — the resting state is the ordinary
case, not the ending.

**D3 — It states the negative explicitly.** "A session is not a turn" and "nothing about a finished piece
of work ends the session" are both stated, rather than leaving the reader to infer them from a positive
description of persistence. The failure mode is a specific wrong inference, and prose that never contradicts
it lets the inference stand — the same reasoning behind that change's D2.

**D4 — The frame points at submit's entry condition instead of restating it.** The lifecycle skill's own
contract is to reference submit and land without repeating their steps, and a rule stated twice drifts.
The section names the boundary — submit is what ends a session, and it waits to be asked — and sends the
reader to the skill that owns the detail.

**D5 — The delta is layered on the unarchived predecessor.** `submit-states-its-entry-condition` is merged
but not archived, so `openspec/specs/` still carries the pre-change requirement text while its delta sits
in `openspec/changes/`. Both changes modify the same requirement, and a MODIFIED delta replaces a
requirement wholesale. Writing this delta against the stale main-spec text would silently revert the entry
condition at sync time. It is therefore written against the predecessor's text, and archiving the two in
either order converges. The alternative — archiving the predecessor first as part of this change — was
declined: it drags contexture's archive backlog (two merged-but-unarchived changes) into a change that has
nothing to do with it.

**D6 — `ctxr-upgrade`'s wording is fixed here rather than left.** It is the only shipped surface that still
sequences submit into land as one motion, it was found by the same audit, and it is two lines. Splitting it
into its own change would cost more review than the edit. It carries no test guard because no requirement
claims anything about that sentence — adding one would over-fit prose that the spec does not govern.

## Risks / Trade-offs

- **The frame now says two things about endings — rest here, submit ends it — and an agent could read the
  second as license.** → The section leads with the resting state and gives the ending one clause that
  immediately defers to submit's entry condition. The failure being repaired is over-eagerness to end, so
  ambiguity that resolves toward "keep working" is the safe direction.
- **More prose in a skill loaded every session.** → Ten lines in the document that sets up every session,
  against a failure that stranded three worktrees. The lifecycle skill is already the longest owned skill;
  this does not change its character.
- **Layered deltas are easy to get wrong if a third change lands on the same requirement.** → Named in the
  proposal's Impact so the next author sees it. The convergence property holds for any number of layers as
  long as each is written against the latest, which is the same discipline as rebasing.

## Migration Plan

Additive to shipped prose. The next `ctxr update` rewrites `ctxr-session-lifecycle` and `ctxr-upgrade` in
place. No config key, no schema version, no command behavior, no store state.
