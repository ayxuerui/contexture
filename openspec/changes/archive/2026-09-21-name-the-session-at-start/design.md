## Context

See proposal.md — Why. Everything this change needs is already present, which is what keeps it small:

- `generateSessionBranchName` (`src/core/session.ts:11-19`) already composes the name from a
  configurable prefix, a sortable UTC stamp, and a uniqueness suffix. It gains a parameter, not a
  second technique.
- `slugifySegment` (`src/core/publish/filing.ts:58-64`) already normalizes a caller-supplied name to
  NFC, lowercases it, and collapses everything that is not a letter, number, or mark into `-`. It is
  the store's existing answer to "turn what a caller typed into a path segment".
- Session identity is already independent of the name. `isSessionWorktreePath`
  (`src/core/session.ts:25-43`) decides a session by its path *shape* precisely so that a session
  survives `ctxr-submit`'s hand `git branch -m`. A labelled branch is exactly the case that rule was
  written for, so nothing downstream — `session list`, the browse surface, the path gate — has to
  learn about labels.
- `ContextureError` subclasses already exist for the shape of refusal this needs, including the
  name-already-taken case: `PublishSlugExistsError` and `PublishInvalidSlugError`
  (`src/core/errors.ts:458-480`).

The one constraint that shapes the work: `session start` is the command an agent runs first, often
before anything else in the store is known to be healthy. Nothing added here may make it fail in a way
that reads as a bug in the tool when it is really a bad argument.

## Goals / Non-Goals

**Goals:**

- A session can be identified by what it is for, in the two places its name is actually read: the
  preview heading in `ctxr serve`, and `ctxr session list`.
- The bare `ctxr session start` keeps its exact current behavior, including its name shape.
- A label that cannot be honored is refused by name, with the usage exit code, having created nothing.

**Non-Goals:**

- Making the label the pull request's branch name, or anything else that ships. See D6.
- Renaming a session that already exists.
- A general rework of how commander-level and git-level failures are classified. See D5 for the scope
  line.

## Decisions

### D1 — A positional label, not `--slug`

`ctxr session start ctx-a`, not `ctxr session start --slug ctx-a`.

The command has exactly one thing to say about the session being started, and a positional is how a
CLI takes its one subject: `ctxr publish new <slug>` is already registered that way
(`src/run.ts:545`), and `session capture`'s `--proposal` is a flag because it names a *file* the
command reads, not the thing the command is about.

The alternative is worth stating plainly, because it was the trigger: an agent guessed `--slug`, and
accepting the guess would make that invocation work. Rejected. A guessed flag is evidence about the
shape callers expect — that there is *something* to pass — and that evidence is honored by taking an
argument at all. It says nothing about spelling, and an API shaped to ratify one model's guess
accumulates synonyms. The guess continues to fail the way it failed before: commander rejects an
unknown option before the action runs, so nothing is created and the exit code is the usage code.

### D2 — The timestamp stays and the label replaces the random suffix

`session/20260920-141233-ctx-a`, against today's `session/20260920-141233-a1b2c3`.

The three random bytes only ever bought uniqueness within one second — the module's own comment ties
the name's design to being "sortable by creation time" (`src/core/session.ts:6-10`). The label does
that job at least as well, so it takes the suffix's place rather than being appended after it, which
would leave a name carrying both a random token and a human one.

Keeping the stamp in front is not cosmetic. `listSessionWorktreeDirs` sorts directory names
alphabetically (`src/core/session.ts:83-86`) and the browse navigation sorts preview worktrees the
same way (`src/core/browse/nav.ts:128`); with the stamp leading, alphabetical and chronological are
the same order. A label-first name would silently reorder that listing by topic.

The bare invocation is untouched: no label means the random suffix, exactly as today. So the
uniqueness that unlabelled sessions have always had is not traded away for this feature.

### D3 — One slugifier, and a length cap

The label is normalized by `slugifySegment`. A second normalizer would be a second set of rules for
the same question, and the two would eventually disagree about a character neither author thought
about.

Reusing it meant moving it. `publish/filing.ts`, where it was written, imports `browse/routes.ts`,
which imports `core/session.ts` — so importing the slugifier from where it lived would have closed an
import cycle for a four-line pure function. It now lives in `src/core/slug.ts`, which depends on
nothing, and `filing.ts` imports and re-exports it so its existing callers and tests are untouched.

The normalized label is then capped at 48 characters, truncated at the last `-` boundary at or before
the cap and with any trailing `-` trimmed. The cap is not about git, which tolerates far longer refs;
it is about the worktree *directory* name, which is a real path segment on every platform the CLI
runs on, and about a preview heading staying readable. A label that is nothing but one 60-character
word truncates mid-word rather than being refused — a truncated name is still a usable name, and
refusing one would be pedantry at the moment a session is trying to start.

A label that normalizes to the empty string — punctuation only, for instance — is refused rather than
silently dropped, because dropping it would hand back a session whose name does not contain what the
caller asked for, with no indication that anything happened.

### D4 — A duplicate LABEL is refused, never suffixed

When an active session already carries the same label, the command exits with the usage code, names
that session's worktree, and creates nothing.

The check is on the label, not on the composed name, and that distinction is the whole substance of
this decision. Composed names carry a timestamp, so two `ctx-a` sessions started seconds apart do not
collide as strings at all — git would happily create both, and the result is two worktrees reading
`…-ctx-a` that differ only in a timestamp, which is precisely the confusion the label exists to
remove. Checking the composed name would have made this decision unreachable in practice.

Auto-suffixing (`-2`, or falling back to the random token) is the obvious alternative and is rejected
for the reason the fail-loud contract already gives: a command that cannot honor an input does not
substitute a guessed value for it (`openspec/specs/cli-contract/spec.md` — fail-loud error contract).
There is also a specific hazard here. Two sessions named `ctx-a` and `ctx-a-2` would be exactly the
naming confusion the label exists to remove, and the caller who typed the second one almost certainly
meant to return to the first.

What counts as "active" is what is on disk: a session that has been submitted and had its worktree
removed frees its label, and one that is still checked out holds it. That is the same definition of a
session the browse surface already uses, and it survives `ctxr-submit`'s hand `git branch -m`, because
the worktree directory keeps the name the label went into.

### D5 — The worktree-add failure becomes a usage error, scoped to this call site

`addWorktree` is given `allowFailure` at `session start`'s call site, and a non-zero result raises a
`ContextureError` carrying git's stderr as detail and the usage exit code.

Scoped deliberately. `addWorktree` has another caller in the portability check, and a blanket change
to how every git failure everywhere is classified is a different change with a different argument.
What this one claims is narrower and defensible: at `session start`, the overwhelmingly likely cause
of git refusing is the name it was handed, which is the caller's input, not a bug in contexture.

This is a prerequisite rather than a bonus. Accepting a label turns a nearly unreachable path into an
ordinary one, and leaving it classified as `internal_error` would mean the commonest new failure mode
reports itself as a crash.

### D6 — Submit's rename stays; the label is not authoritative

`ctxr-submit` step 7 keeps renaming the branch when a name is needed for the forge. The label does not
become the pull request's branch name, and nothing verifies that the two agree.

This is the deliberate answer to the strongest objection to the whole change, stated in Risks below:
a name chosen before the work is a prediction, and predictions go stale. Keeping submit's rename means
a stale label costs nothing downstream — it is a handle for finding the right worktree during the
session, and it stops mattering at the moment a name that must be accurate is chosen.

### D7 — The duplicate-label scan reads the filesystem; git still decides the create

The check enumerates the session worktree directories (`listSessionWorktreeDirs`, a `readdir`, no git
subprocess) and recovers each one's label by matching the name contexture composed:
`<prefix><stamp>-<label>`, with the stamp fixed-width. Recovering the label by pattern rather than by
a suffix test is deliberate — a suffix test would report a session labelled `ctx-a` as already
holding the label `a`.

The scan is not the authority on whether the worktree can be created. `git worktree add` performs its
own checks and refuses for reasons the scan knows nothing about — an unusable branch prefix, an
occupied path, a repository problem — and D5's mapping turns any of those into a usage error too. So
the scan produces the better sentence for the case worth naming, and git decides the rest.

The alternative — parsing git's stderr to tell "already exists" from every other refusal — is rejected
as a message format that is not a contract and changes between git versions.

## Risks / Trade-offs

- **A label chosen at minute zero can go stale.** This is the real cost, and it is not fully
  mitigable. The unit that ships is decided at submit — its own step 4 contemplates a session that
  produced two disjoint units — so a session labelled for what it was started to do may end up
  carrying a name that describes part of the work, or none of it. Three things keep it acceptable:
  the label is optional, it never reaches the forge (D6), and the status quo it replaces is not an
  accurate name but no name at all. A wrong label is worse than a right one; a wrong label is not
  obviously worse than `a1b2c3`.
- **Two naming moments instead of one.** A caller now names a session at start and may rename the
  branch at submit. Accepted: they name different things, at the moments each is knowable — a
  worktree to find, and a pull request to review.
- **The worktree directory keeps the label even after a submit rename.** Deliberate, and the reason
  the label is worth having at all: the directory name is what the preview heading and `session list`
  actually read.
- **A label leaks whatever the caller types into a directory name and a git ref.** Normalization
  reduces it to letters, numbers, and `-`, but it does not redact. A caller who labels a session with
  something sensitive has published it into their own repository's ref namespace. Worth a sentence in
  the shipped skill; not worth a filter that would have to guess what is sensitive.
