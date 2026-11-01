---
name: ctxr-session-capture
description: At the end of a session, propose in one message both the durable notes it produced and any house convention it earned, with per-item approval, then write only what was approved.
---

## Before this skill: the store's tools stand in for a checkout

### In a checkout, use the store's own skill

If the working directory has a `contexture.yaml` at its root and a shell here runs `ctxr`, you are in a
checkout of the store, and this text is not for you. The `ctxr:`-namespaced skills and commands, such as
`ctxr:ctxr-capture` and `/ctxr:capture`, are this plugin's, written for the store's server. The
un-namespaced `ctxr-<name>` skills in the store's skills folder are the store's own, written for a checkout.
In a checkout, invoke the un-namespaced `ctxr-<name>` skill of the same name and follow it, never the
`ctxr:` one, and ignore the rest of this text. A `/ctxr:` command typed in a checkout asks for that store
skill.

### Through the store's server

Otherwise you are working through this store's server, not in a checkout of it. Nothing runs a shell here, so no
`git`, `gh` or `ctxr` command runs as written. The skill below was written for an agent with a checkout:
follow it as written, and take each step it names through the tool these tables give.

### Commands

| Command | Tool |
| --- | --- |
| `ctxr session start` | `session_start` |
| `ctxr session list` | `session_list` |
| `ctxr session status` | `session_status` |
| `ctxr session submit` | `session_submit` |
| `ctxr session rebase` | `session_rebase` |
| `ctxr session discard` | `session_discard` |
| `ctxr shared-stores sync` | none |

A command marked none has no counterpart here: skip that step and say nothing about it. Each other tool takes its command's options as fields, each named for its option without the leading
dashes, and the session the command names as `session`: the session worktree's directory name, which
`session_start` returns and `session_list` lists. `session_start` takes the session's name as `label`.

Every other `ctxr` step runs through the `ctxr` tool when the command only reads, and through `ctxr_write`
when it writes. Pass the words after `ctxr` as `args`, one word per entry: a step that says to run
`ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`. Name a session as `session` to run the command
in that session's working tree; `ctxr_write` always needs one. When a command reads a file you prepared,
pass the file's text as `input` and write `@input` in `args` where its path goes.

### Git steps

| Git step | Tool |
| --- | --- |
| `git mv` | `Move` |
| `git rm` | `Delete` |
| `git status` | `session_status` |
| `git diff` | `session_status` |
| `git log` | `session_status` |
| `git add` | `session_submit` |
| `git commit` | `session_submit` |
| `git push` | `session_submit` |
| `git branch -m` | `session_submit` |
| `gh pr create` | `session_submit` |
| `gh pr edit` | `session_submit` |
| `git fetch` | none |
| `git merge --ff-only` | none |
| `git rebase` | `session_rebase` |
| `git worktree add` | `session_start` |
| `git worktree list` | `session_list` |
| `git worktree remove` | `session_discard` |

Commits, pushes and pull requests happen only in `session_submit`. A step marked none is the server's own
work: it keeps the store's clone current, and `session_start` branches from the freshly fetched default
branch. Skip that step and say nothing about it.

### Paths

`session_start` returns the session's root, a path such as `<worktrees path><directory>/`. Every path the
skill names is relative to the store; inside a session it goes under that root, so the note `work/a.md` in
that session is `<worktrees path><directory>/work/a.md` for `Read`, `Edit`, `Write`, `Move`, `Delete`,
`Grep` and `Glob`. A path without a session root reads the store as it was last approved, and a write to one
is refused. A change rests uncommitted in its session until `session_submit`.

### This store's settings

Where the skill uses one of this store's settings, it names the setting with a placeholder in angle
brackets, such as `<inbox path>`, `<log path>` or `<default branch>`. The connector's instructions give each
one's value under *This store*, by the same name, with the store's layers and its relation vocabulary. Use
that value wherever the placeholder appears, inside a path too: `<capture root>assets/` with a capture root
of `sources/` is `sources/assets/`. Other words in angle brackets, such as `<path>`, `<title>` or `<session>`, are
yours to fill as the step says. If the instructions are not in front of you, AGENTS.md states most of these
values; for one it does not state, ask the person rather than guess.

### More than one contexture connector

Someone in several stores has one connector per store, and each one's instructions name its own store and
values. Use the connector of the store the person names, with that store's values, and ask when it is unclear
which store they mean. A session, a path or a value from one store's connector never goes to another's.

### A step this connector does not offer

The skills update when contexture releases, and a store's server can run an older ctxr: *This store* gives
the version it runs. When a step names a tool the connector does not list, or the `ctxr` or `ctxr_write`
tool refuses a command the step names as one it does not run, tell the person that this store's server runs
an older ctxr, then skip that step or take the nearest step the connector does offer. Never improvise a
replacement for a step that writes.

### Sessions across conversations

The server keeps a session between conversations, but it cannot tell two conversations apart. At the
start of a conversation, call `session_list` and mention each open session: what it holds uncommitted,
and any requested changes on its pull request. Work in the session the person names, or start one.

Where the skill hands off to a skill this environment does not carry, such as landing or upgrading, or
asks you to work inside a store mounted under `shared/`, that step is not yours here: a person lands an approved change from the store's approval page.

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Session capture

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
