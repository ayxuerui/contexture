---
name: ctxr-mission
description: Keep the store's mission core current — the primary mission, the top priorities in rank order with status/purpose/next action, and what is not now — with the back burner, sunset candidates, and open debt in a linked register; propose changes and write only on the operator's confirmation.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Mission

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

Keep this store's mission current: the short core every agent sees on every turn, inlined into AGENTS.md's
"Mission" section from the document named on its source line. The core is the operator's statement of what
matters now, so it is small, ranked, and dated. Everything else it once carried lives in a register note it
links to. Hand-written content outside the fenced region is never touched.

Run `ctxr rollup stale` (or `--for <mission_path>`) first. A mission never confirmed, or one confirmed more than
`organize.rollup_stale_days` ago, is reported stale on elapsed time alone; `ctxr lint` also reports any due date
in it that has passed. Use those rather than guessing from memory whether it is out of date.

1. Resolve `<mission_path>` from the source line of AGENTS.md's "Mission" section. If no mission document is
   configured for this store, STOP — this skill has nothing to maintain; do not invent a path or create one
   unasked.
2. Gather from recent work: the current session's own changes, the store log at `<log path>`, and every store
   location the taxonomy declares (read AGENTS.md's "Placing a new note" section for the configured layers) —
   not backlinks, and not a sample. A priority absent from every configured layer is not a store priority; treat
   it as the operator's own working memory instead and leave it out.
3. Write the core, and only the core:
   - **Primary mission** — one or two lines on what this store is for, right now.
   - **Top priorities, in rank order** — three to five. Each names its status, its purpose, and its next useful
     action; a priority with no next action is not actionable, and one with no purpose is not a priority —
     resolve or downgrade it rather than carry it silently.
   - **Not now** — what is deliberately set aside, one line each, so it is not mistaken for forgotten.

   The core stays under `<mission size limit>` bytes; `ctxr doctor` fails above it. Per-item detail an agent
   already finds elsewhere (a project's own next action, a status its note carries) is linked, not copied.
4. Keep the register in a note the core links to, placed by `ctxr-placement` like any other: back-burner items,
   each stating plainly why it is not active right now (a size cutoff, a blocking dependency, a deliberate
   deprioritization); sunset candidates (work whose end state is in sight or whose relevance is fading); and
   open operational debt (deferred cleanup, known gaps, workarounds owed a real fix). Debt that is closed is
   history: record it in `<log path>` and remove it.
5. Propose, then write. The ranking and the mission are the operator's: show the proposed core and say what
   moved and why, and write only once the operator confirms. A factual correction — a priority shipped,
   blocked, or archived — is yours to make, and you say so in the report.
6. Synthesize into a file — bullets throughout, short clauses; skip any empty section silently (never "N/A",
   "none", or "TBD"). Nothing dated later than today; no editorializing beyond the shape above.
7. Write: `ctxr rollup write <mission_path> --content-file <file>` — the same command `ctxr-rollup` uses for an
   entity, applied here to the store's own mission path. It stamps the confirmation date AGENTS.md shows, and
   is an idempotent fenced write (`changed: false` and a byte-identical file when the content matches;
   mismatched markers abort with nothing written).

## Report

Mission path, `changed` or unchanged, what moved since the last write (a priority resolved, re-ranked, or
added; an item moved to the register), and any factual correction made without confirmation. Anything outside
the fence you want to fix is a separate, explicit edit.
