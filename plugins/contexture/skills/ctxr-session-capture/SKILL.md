---
name: ctxr-session-capture
description: At the end of a session, propose in one message both the durable notes it produced and any house convention it earned, with per-item approval, then write only what was approved.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Session capture

## Which store, and where

This skill runs in a shell that runs `ctxr`, or through a contexture store's server. Settle two things first.

**Which store:** the one the person means. With several contexture connectors attached, use that store's,
and ask when it is unclear. Nothing from one store's connector goes to another's.

**Where:** in a checkout of that store (a `contexture.yaml` at the working directory's root and a shell
that runs `ctxr`), follow each step in the shell as written, even when the store's connector is attached
too. Otherwise work through the store's connector:

- A `ctxr session <verb>` step is the tool `session_<verb>`; `session_start` takes the session's name as
  `label`. Every other `ctxr` step is the `ctxr` tool, or `ctxr_write` when it writes, with the words after
  `ctxr` as `args`, one per entry: `ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`.
- A command's options are the tool's fields, named without the dashes. `session` names the session's
  directory, which `session_start` returns and `session_list` lists; `ctxr_write` always needs one. A file
  you prepared goes as `input`, with `@input` in `args` where its path goes.
- Paths go under the session's root: the note `work/a.md` is `<worktrees path><directory>/work/a.md` for
  `Read`, `Edit`, `Write`, `Move`, `Delete`, `Grep` and `Glob`. A path outside a session reads the store as
  last approved and cannot be written. Commits, pushes and pull requests happen only in `session_submit`.
- The server keeps sessions between conversations but cannot tell conversations apart. At the start of
  one, call `session_list` and mention each open session, what it holds and any requested changes.
- Landing, upgrading and work inside a store mounted under `shared/` are not done through the server. A
  person lands an approved change from the store's approval page.
- When a step names a tool the connector does not list, or the `ctxr` tool refuses a command as one it
  does not run, the server runs an older ctxr (*This store* gives its version). Say so, then skip the step
  or take the nearest one offered. Never improvise a replacement for a step that writes.
- A store setting written as a placeholder, such as `<inbox path>` or `<default branch>`, takes the value
  the connector's instructions give under *This store*, inside a path too. AGENTS.md states most of them;
  otherwise ask.

End-of-session capture: propose what the session produced that is durable, write only what is approved.
The approval gate is what keeps the blast radius low — nothing is written without it.

A session produces durable material in two shapes, and they go to different places: a **fact** about
what happened is a note; a **rule** for how future work should go is a convention, and belongs in this
store's house conventions at `<house conventions path>`, which is inlined into AGENTS.md and so loads
at the start of every session. One pass proposes both.

## When

Fires on the user's own closing utterance ("done", "ship it", "that's all", a sign-off) or an explicit
request. A request to open a pull request is also a wrap signal — finish the pull request first, then
propose (after the LAST one of a batch, not once per request).

Anti-triggers — stay silent when: an error, failed test, pending question, or requested follow-up is
outstanding (the session is not over); the recent turns are dominated by tuning the store or this skill
itself (nothing is capturable until that lands and gets used); the items would substantially repeat a
proposal already made this session. The agent's own summary never counts as a signal, nor does a cue
word inside quoted text, nor a request for a session summary. Zero durable items → silent; never emit
"scanned, nothing to save".

## What is durable

Include: decisions with their rationale; net-new concepts; net-new people, organizations, or
initiatives with context; reusable patterns and playbooks; resolved non-obvious problems worth future
recall; durable preference or environment facts the user corrected you on.

Exclude: tool output, command traces, transient debugging; read-only investigation with no conclusion;
scratch work that landed on no decision.

Unsure → propose (the user can decline).

## What is a convention

A convention is a rule for future work. The test that separates it from a note: a note records that
something happened, a convention changes what happens next. "We chose Postgres, because X" is a note.
"Name migrations with the date first, because they sort" is a convention.

The default answer is NO — a store that gains a convention every session ends with a bloated,
self-contradicting document nobody reads. Propose one only when all four hold:

- It is a rule for future work, not a fact about past work.
- It applied more than once, or the user stated it as a correction.
- It is store-wide. A rule about one folder belongs in that folder's `README.md`, not here.
- It is not already in the shipped baseline, the first block of `AGENTS.md`'s "Store conventions"
  section — read it first. Restating contexture's own behavior as a house rule is the most likely way
  to get this wrong.

Propose REMOVALS on the same bar: a convention the session contradicted, or that no longer matches how
work actually goes, is worse than none — it teaches the next agent something false. The inlined section
also has a hard ceiling (`harness.convention_max_bytes`), so growth-only is not a maintenance strategy.

Each entry states the rule, why it exists, and how to apply it. The Why is not decoration: without the
observation that earned it, no future reader can tell whether a rule still holds or whether a one-off
calcified, so it never gets retired.

## Proposal — ONE message, empty proposal omitted

```
### Store notes
- A1  path: <layer>/<location>/<Title>.md
      sketch: bullets

### House conventions
- C1  add · <section> — <the rule, as an imperative>
      why: <what goes wrong without it — the observation this session produced>
      apply: <what to do concretely>
- C2  remove · <the rule, quoted> — <what contradicted it>
```

Secret-marker pass: any item whose content looks like a credential gets `⚠ suspected-secret:` on its
own line with why (patterns worth checking: `sk-`, `ghp_`, `AKIA` + 16 chars, `Bearer …`, a JWT
`eyJ…`, a URL with a token/key/secret parameter). The marker is a hint; the user is the gate.

End with: "Approve by ID (e.g. `A1 A3`) or `skip`." An edit request → re-propose. An ambiguous
answer → do not proceed.

## Apply

Write ONLY the approved items to a YAML proposal file, in the shape `ctxr session capture` reads:

```yaml
notes:
  - id: A1
    path: <layer>/<location>/<Title>.md
    mode: create            # or: append
    body: |
      for create: started from a template under `<templates path>`, with {{title}} and {{date}}
      substituted, sections that do not apply deleted rather than left empty
      for append: only the new material, extending the note rather than restarting it — the
      command appends your body verbatim and never rewrites what is already there
      (`ctxr-placement` decides both the location and the template)
```

Then run `ctxr session capture --proposal <file>`. It validates and writes every item independently —
one bad path never blocks the rest. These note commits ride the session pull request
(`ctxr-session-lifecycle`).

Approved conventions are a direct edit to `<house conventions path>`, never the YAML above: `ctxr
session capture` writes NOTES — it takes a path and a body — and a guidance file is not a note. Edit it under the matching
section, then run `ctxr update` so AGENTS.md re-inlines it, and stage BOTH in the same commit: a staged
guidance change without a matching staged AGENTS.md regeneration fails `doctor --staged` and the
pre-commit hook refuses it. If the file does not exist yet (a store migrated in from before it was
seeded), say so in the proposal and create it with the approved entries — never unasked.

## Report from actual writes

Report exactly what the command reported — wrote / appended / refused (with reason) / skipped, by ID —
never from the proposal itself. A refused item is surfaced prominently with its reason. For conventions,
report the section each entry landed in or was removed from, and that `ctxr update` re-inlined them.
