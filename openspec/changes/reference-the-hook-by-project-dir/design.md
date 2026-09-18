## Context

See proposal.md — Why. Everything this needs already exists:

- `mergeHookEntries` (`src/core/json-config-merge.ts`) matches an incoming hook entry against the
  existing list by `(matcher, hookCommandBasename)` and is documented as "deliberately blind to the
  absolute path prefix". The basename is unchanged by this change, so the new command replaces the old
  one in place, drops any further stale copies, and leaves an operator's own hook alone. Migration is
  therefore already implemented — this change gets it for free rather than adding anything.
- The adapters spec already states the principle for the primitive's own body: no installation-specific
  path baked in at generation time, byte-identical across machines. This change applies the same
  sentence to the primitive's invocation.
- `${CLAUDE_PROJECT_DIR}` is Claude Code's documented placeholder for "the project root where the
  session started", substituted into the command string and also exported into the hook process's
  environment.

The constraint that shapes it: the value must be correct in a checkout that does not exist when the
config is written. Any mechanism that resolves a path at generation time fails that by construction,
which is why the predecessor could only choose *which* wrong-for-someone absolute path to bake in.

## Goals / Non-Goals

**Goals:**

- Make the committed `.claude/settings.json` identical on every machine, so it can be shared.
- Keep the hook resolving in whichever checkout the session actually opened, canonical or worktree.
- Migrate existing stores with no new machinery and no operator action.

**Non-Goals (design-level, beyond the proposal's):**

- No new adapter interface version. The input type is unchanged; only one adapter's `render` body moves.
- No runtime detection of harness capabilities. Whether a harness has a placeholder is a static fact
  about that harness, so it belongs in its adapter, not in a probe.

## Decisions

### D1 — Use the harness's placeholder, not a store-relative path

The command becomes `${CLAUDE_PROJECT_DIR}/.claude/hooks/claude-code-write-gate.sh`.

The obvious cheaper alternative is a bare relative path — `.claude/hooks/claude-code-write-gate.sh` —
which is equally machine-independent. Rejected: a relative command resolves against the hook process's
working directory, which Claude Code does not promise is the project root, and the placeholder exists
precisely because of that gap ("regardless of the working directory when the hook runs"). A relative
path would work until someone launched a session from a subdirectory, then fail open silently — the
exact failure mode the fail-closed requirement beside this one forbids.

### D2 — The placeholder is a literal, and the path is joined with `/`, not `path.join`

`PROJECT_DIR_PLACEHOLDER` is a plain string constant and the command is assembled by interpolation.

Rationale: `path.join` on Windows would produce backslashes and mangle the placeholder token into
something the harness no longer recognizes. The value is a harness-interpreted string that happens to
look like a path, not a path this process should normalize — and `HOOK_TARGET_PATH` is already a
forward-slashed store-relative literal for the same reason.

### D3 — `mainRoot` stays on `PermissionConfigInput`

After this change no adapter reads it, and `adapters-generate.ts` still resolves it once per run
(one `git worktree list`).

Rationale: the spec keeps the absolute-path fallback for a harness that publishes no placeholder, and
that fallback is only expressible if the input carries the main worktree. Removing the field would make
the fallback unimplementable and would change a documented adapter interface that third-party adapters
build against — a cost far above the one subprocess it saves. The doc comment on the field is retightened
to say it is the fallback rather than the default, so the next adapter author is not sent down the path
this change is retiring.

### D4 — No `retiredRules` entry, and no exact-match removal of the old command

Nothing is added to `retiredRules`.

Rationale: `retiredRules` removes *permission rules* by exact match, and its exactness is the point —
a predicate sweep would also catch a hand-added rule of the same shape. The old hook command cannot be
matched exactly anyway, since its value differs per machine, which is exactly why `mergeHookEntries`
matches hook entries by basename instead. That basename-matching path already converges this case, and
it converges *any* number of accumulated stale copies, not just the one a version bump would know about.
Adding a second migration mechanism for the same entry would risk the two disagreeing.

### D5 — The fail-closed guarantee is unchanged, and is what rules out the cheaper options

An enforcement primitive that cannot run must not be treated as an allow. That requirement is not
touched, and it is the reason both a bare relative path (D1) and any generation-time resolution are
rejected: each has a reachable state where the command does not resolve, and a hook that does not
resolve fails open.

The placeholder has no such state. It is expanded against the project the harness has open, and the hook
script is tracked in git, so it is present in the canonical checkout and in every worktree cut from it.

## Risks / Trade-offs

- **The placeholder is Claude-Code-specific.** It is correct that this lives in the `claude-code`
  adapter and nowhere else; a harness without an equivalent keeps the absolute-path fallback. The spec
  is written per-harness for that reason rather than mandating one token.
- **A store whose `.claude/hooks/` is untracked or gitignored would not have the script in a fresh
  worktree.** Contexture writes the script into the store and ships no gitignore excluding it, so this
  is not reachable through contexture's own scaffolding — but a store that deliberately ignored
  `.claude/` would have had a broken hook under the old scheme too, just in a different checkout.
- **One wasted `git worktree list` per run** while `mainRoot` has no consumer (D3). Accepted as the price
  of keeping the documented fallback implementable.
