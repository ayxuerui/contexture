## Context

`submit-is-its-own-consent` (archived 2026-09-02) removed submit's fire gate. Its argument was that the
gate stood between the operator and an outcome they had specifically requested, so it only ever got one
answer, and a confirmation that only ever gets one answer makes the gates that matter cheaper too. That
argument holds. It is load-bearing on one premise, stated in the proposal as "invoking it is already the
operator asking" and in the spec as "because the request to submit is itself the consent for both."

Nothing was added to make the premise true. Skills are prose an agent reads and acts on; a precondition
that appears only in a spec sentence and an archived proposal is not available at the moment an agent
decides whether to open the skill. Its own Risks section came close to this — "an agent pushes a branch
the operator would have caught in the summary" — but answered the wrong question, treating the pull
request as the review surface. The failure below never reaches a push.

The reported session: operator asks for one note. Agent writes it, then loads `ctxr-submit` unprompted,
runs `doctor` / `lint` / `catalog check` across some thirty tool calls, and asks whether to commit, push
and open the PR. The prompt times out. The operator's next message adds a second deliverable — the
session was not over, and nothing about "the request to submit" had ever happened. The work then sat
uncommitted, because a submit that half-fires and stalls strands the branch it was rehearsing for.

## Goals / Non-Goals

**Goals.** Make the premise the consent model rests on readable at the point of decision. Name the
specific misread that produced the failure — task complete ≠ session over. Keep the handoff to land
cheap enough that work reaches `main`.

**Non-goals.** Reintroducing the gate (see proposal). Touching land's merge gate. Auditing the other
shipped skills for entry conditions.

## Decisions

**D1 — The fix is an entry condition, not a restored gate.** These are different repairs to different
holes. A gate asks "confirm this side effect"; an entry condition asks "are you supposed to be here at
all". The observed failure is entirely upstream of any side effect — the agent burned a validation
rehearsal and fired an unrequested question, and never pushed anything. A restored gate would not have
prevented one tool call of it, and would have reinstated the always-yes prompt whose removal was correct.
Fixing the premise instead leaves `submit-is-its-own-consent`'s reasoning intact and, for the first time,
true.

**D2 — The anti-triggers name the specific misread, not a general caution.** "Only submit when asked"
would not have stopped this: the agent believed the note *was* the deliverable and that delivering it
concluded the session. So the section says finishing the assigned task is not a closing signal, that the
agent's own summary is not one either, and that a pending question or follow-up rules submit out. Written
as a general instruction to be careful, the section would read as agreeable and change nothing.

**D3 — Two behavioral tells, because the anti-triggers alone are checkable only in hindsight.** An agent
mid-session cannot always tell whether the operator considers the work finished, but it can notice what
it is about to do. Reaching for `ctxr doctor` / `ctxr lint` / `ctxr catalog check` to decide *whether* to
submit is one tell — those are steps inside a requested submit, so running them ahead of one is a
rehearsal. Composing "shall I open the pull request?" is the other, and it is the sharper of the two: it
resolves the standing tension where an agent that self-entered reads step 8's "do not stop to confirm
first" as forbidding the very question its own uncertainty is generating. Needing to ask means leaving,
not asking.

**D4 — `## Steps` is added, not just `## When`.** The template had no headings at all. Introducing one
section leaves the numbered list appearing to hang off it, which inverts the meaning — the anti-triggers
would read as steps. Two headings is the smallest change that keeps the document's structure honest.

**D5 — The lifecycle scenario at `harness-portability` is left alone.** It reads "a push and a
pull-request open are not [confirmed] (the request to submit is itself that consent)". That parenthetical
is exactly what this change makes true rather than assumed, so it needs no edit — and restating the entry
condition there as well would put the same normative claim in two requirements, which is the duplication
this project's spec rules push against. The condition is stated once, in the requirement that owns the
submit skill's contract.

**D6 — The guard rides the existing submit test, not a new one.** The entry condition and the ungated
push are one argument: the push is safe *because* entry required a request. Splitting them into two tests
invites deleting one and leaving the other looking self-sufficient. The assertions were confirmed to fail
against the pre-change template before being taken as passing.

## Risks / Trade-offs

- **An agent reads the anti-triggers and becomes reluctant to submit when actually asked.** → The entry
  condition leads with what *does* admit it, and the closing paragraph makes stopping-without-submitting
  an ordinary end to a turn rather than a failure. The failure mode this replaces — an unrequested
  rehearsal plus an unanswerable question — is strictly worse than one extra "submit" from the operator.
- **Prose is not enforcement; an agent can still ignore it.** → Accepted, and consistent with this
  project's enforcement rule: the requirement claims only that the shipped skill *states* the condition,
  which `test/unit/skills.test.ts` checks. The guarantee about the default branch is unchanged and is
  about the merge.
- **Stores pin older `ctxr` versions and will not see this until they update.** → Same delivery path as
  any shipped-prose edit; no migration, no schema change.

## Migration Plan

Additive to shipped prose. The next `ctxr update` rewrites `ctxr-submit` in place and re-renders
`AGENTS.md` from `canonical.md`. No config key, no schema version, no command behavior, no store state.
