## Why

`ctxr session start` names the session for you: `session/20260920-141233-a1b2c3`, a UTC timestamp and
three random bytes (`src/core/session.ts:11-19`). The name is generated because the command has
nothing else to go on — it takes no argument and no option.

That name is not private to git. It is also the worktree's directory name, and the browsing surface
renders the directory name as the heading over that session's preview pages: `previewGroupLabelFor`
deliberately lets the worktree segment "keep its own directory name" (`src/core/browse/nav.ts:91-105`).
It is likewise all `ctxr session list` has to offer — `{branch, worktree, head}` and nothing more
(`src/commands/session-list.ts:12-16`) — which is what an agent must choose between when the lifecycle
skill sends it there to find the active sessions to work in.

The workflow already concedes that the name matters, only later and by hand. `ctxr-submit` step 7:
"if it still carries a generated name, `git branch -m "<name>"` before pushing — never let a generated
name reach the forge" (`templates/skills/ctxr-submit.md:42-43`). A prohibition phrased that way exists
because the thing it prohibits happens. And that rename reaches the branch alone: the worktree
directory keeps its generated name for the session's whole life, so the preview heading and
`session list` stay opaque no matter how carefully submit is followed.

What prompted the look was an agent invoking `ctxr session start --slug <label>`. That flag has never
existed — the string appears in no commit on any branch — and commander rejected it before the action
ran, so nothing was created and the exit code was the usage code. The guess is not evidence of a
defect. It is evidence about the shape a caller expects, and it is a coherent guess: the same CLI
already takes `ctxr publish new <slug>`, and the work had a name before the session did.

One existing defect has to be fixed for this to be honest. `addWorktree` does not pass `allowFailure`
(`src/core/git/worktree.ts:22-30`), so a `git worktree add` refusal escapes uncaught, lands in
`runCommand`'s generic catch (`src/run.ts:114-126`), and is reported as `internal_error` with the
internal-error exit code and git's raw stderr as the message. Today that path is nearly unreachable,
because a generated name cannot collide. A caller-supplied name makes it ordinary, so the
classification is part of this change rather than a follow-up to it.

## What Changes

- `ctxr session start [label]` accepts an optional positional label. The bare invocation is unchanged
  in every respect.
- The generated name keeps its timestamp and the label replaces the random suffix:
  `session/20260920-141233-ctx-a`. Ordering by name therefore stays chronological, which is what the
  browse surface's alphabetical listing of worktree directories relies on
  (`src/core/session.ts:75-87`, `src/core/browse/routes.ts:217`).
- The label is normalized by `slugifySegment` — the slugifier the publish path already uses, moved to
  `src/core/slug.ts` so that reusing it does not close an import cycle — and a label that normalizes
  to nothing is refused.
- A label already carried by an active session is refused as a usage error naming that session's
  worktree, creating nothing. The caller's label is never silently altered to make it fit.
- `session start`'s own `git worktree add` failure is reported as a named usage error rather than an
  internal error.
- `templates/skills/ctxr-session-lifecycle.md` and `templates/skills/ctxr-submit.md` state the label,
  and state what it does not do.

Nothing here is breaking. The bare form produces the same shape of name it produces today;
`isSessionBranch` and `isSessionWorktreePath` are untouched and already tolerate arbitrary names,
since a session must stay recognizable after a hand `git branch -m` (`src/core/session.ts:25-43`); and
no config key, schema version, or on-disk artifact changes.

## Capabilities

### New Capabilities

None. The change lands on the existing `write-lifecycle` capability.

### Modified Capabilities

- `write-lifecycle`: the session-worktree requirement gains the optional label, the refusal behavior
  for a label that collides or normalizes to nothing, and the scenarios pinning both. Its existing
  distinctness guarantee is restated so that it still holds when the caller supplies the name rather
  than the command. The hook, path-gate, and capture requirements are untouched.

## Non-goals

- **Accepting `--slug`, the flag that prompted this.** The positional reads correctly where it is
  typed, and shaping an API around a model's guess is the wrong reason to add a flag. The guess keeps
  failing loudly and safely, which is the right outcome for it. Argued in design.md D1.
- **Making the label authoritative for what ships.** Submit's rename stays exactly as it is. The label
  is a working name for a session, not a commitment about the pull request. Argued in design.md D6.
- **Renaming a session after the fact** — a `session rename` verb, or moving the worktree directory
  once pages are being previewed out of it. That is a second naming moment with a live directory
  underneath it, and this change does not need it.
- **Auto-suffixing a colliding label to make it unique.** Silently returning a name other than the one
  asked for is the guessed fallback the fail-loud contract forbids. Argued in design.md D4.
- **A config key to require, forbid, or template labels.** Optional is the whole design; a key would
  make every store re-decide a question that has a good default.
- **The two parser-level defects found alongside this.** `src/run.ts:669` re-writes the message
  commander has already written, so a usage error prints twice on stderr; and a parser-level usage
  error under `--json` emits no envelope at all, because commander throws out of `parseAsync` before
  `runCommand` can build one. Both are `cli-contract` concerns about argv parsing in general rather
  than about session naming, and folding them in would make this change about two unrelated things.
