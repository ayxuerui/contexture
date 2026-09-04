## Context

`renderHook()` (`src/core/hooks.ts:34-40`) renders `templates/hooks/pre-commit.sh` and
`templates/hooks/pre-push.sh` for `ctxr init`/`doctor`, substituting `__CONTEXTURE_BIN__` with
`resolveOwnBinPath()` — `fileURLToPath(new URL('../bin.js', import.meta.url))`, i.e. wherever the
currently-running `ctxr` module resolves its own `dist/bin.js`. `installTemplatedHookScript()`
(`src/core/hooks.ts:96-107`) does the same generic find-and-replace for
`templates/hooks/claude-code-write-gate.sh`, called from `generateAdapterOutputs()`
(`src/commands/adapters-generate.ts:57,66`) with `binPath: resolveOwnBinPath()`. Both rendered
scripts are written into the store's tree and committed (`write-lifecycle`'s "install a
version-controlled … hook" requirement; `adapters`' permission-config requirement) — so the
generating machine's path is what every future checkout, container, and collaborator inherits.

Both templates already guard the missing-file case, but in the wrong direction: they warn to
stderr and `exit 0`, i.e. treat "the CLI isn't where I expect" as "let the write/commit through."
`stabilize-write-gate-hook-path` (2026-09-02) already fixed the *other* half of this file's
portability — the absolute path baked into `.claude/settings.json`'s hook *command* now resolves
against the store's main worktree (`mainRoot`) instead of whichever checkout ran the generator —
but that only ever anchored the path to the *script*, not to the *interpreter the script itself
shells out to*. This change fixes that second, until-now-unaddressed half.

## Goals / Non-Goals

**Goals:**
- A rendered hook script contains no filesystem path specific to the machine that generated it —
  byte-identical output on every machine, which is what `harness-portability`'s
  "byte-stable when nothing has changed" requirement already expects of every generated file.
- When the hook cannot find a `contexture` executable to run, it fails closed (deny / refuse)
  instead of silently letting the operation through, per `adapters` spec's existing "a primitive
  that fails to resolve SHALL NOT be treated as equivalent to a passing enforcement decision."
- One resolution algorithm, shared by both hook templates, so they cannot independently drift.

**Non-Goals:**
- Changing `ctxr adapters write-gate`'s own decision logic or its documented never-exit-2 contract
  for its *internal* errors (unparseable stdin, no resolvable store) — untouched; this is only
  about the wrapper script that invokes it.
- `doctor` staleness detection for `.claude/hooks/claude-code-write-gate.sh` — `detectStaleHooks()`
  today only covers `.githooks/*`. Real gap, not this change's to close.
- `init --harness <id>` never running the generator on a fresh store (issue #56) — separate,
  unrelated failure mode on the same control.

## Decisions

**1. Runtime resolution: `CONTEXTURE_BIN` override, else `PATH`, no baked-in fallback.**

The issue's own suggested fix (`exec ctxr adapters write-gate`, PATH-only) is closer to correct
than the current code, but a bare PATH lookup gives an operator no way to pin a specific install
(a dev checkout's unpublished `dist/bin.js`, or a machine where `ctxr` isn't globally installed) —
exactly this repo's own dev flow, per the user's memory note that "host ctxr is linked to the dev
checkout." So the resolution order is: `$CONTEXTURE_BIN` if set and it points at an existing file,
else `command -v ctxr` on `PATH`, else nothing resolves.

Naming: `CONTEXTURE_BIN`, not `CTXR_BIN` — `openspec/config.yaml`'s naming rule reserves
`CONTEXTURE_*` for everything environmental (env vars, the `.contexture/` home directory,
`contexture.yaml`), `ctxr` only for the executable name inside shipped instructions. It also
matches the shell variable both templates already use (`CONTEXTURE_BIN="..."`) and the sibling env
var `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH` in `pre-push.sh`.

*Alternative considered*: keep the baked path as a fallback after `PATH` (the issue's "if a
fallback is still wanted" suggestion). Rejected — it keeps the rendered file machine-specific,
which keeps tripping `detectStaleHoots()`'s (git hooks') per-machine churn and defeats the
byte-stability goal; an operator who wants to pin an install can already do that with
`CONTEXTURE_BIN`, with no generate-time cost.

**2. A CONTEXTURE_BIN pointing at a `.js` file is invoked via `node`; anything else, directly.**

A dev checkout's `dist/bin.js` is not `chmod +x` — `tsc` doesn't set the executable bit — so
`node "$CONTEXTURE_BIN"` is still needed for that case; an installed `ctxr` shim (what `PATH`
resolves) is already executable and invoked directly. The resolution sets a command *prefix*
(`"$@"`) rather than a single string, so both shapes compose the same way into the trailing
subcommand (`"$@" adapters write-gate`, `"$@" doctor --staged --json`).

An override that's set but doesn't resolve (file doesn't exist) falls through to `PATH` rather than
erroring immediately — an operator's stale `CONTEXTURE_BIN` from an old install must not itself
become the failure; `PATH` gets a chance first, and only "neither resolves" triggers fail-closed.

**3. The shared partial calls a per-hook `ctxr_unavailable()` callback rather than leaving a
generic empty command to test for.**

Each template defines `ctxr_unavailable(reason)` *before* inlining the partial — the write-gate's
prints the structured deny JSON and exits 0; pre-commit's prints a stderr message and exits 1 — and
the partial calls it (never returns) at whichever rung fails, passing a reason specific to *that*
rung (e.g. "CONTEXTURE_BIN names a path that is not a file: …" vs. "no ctxr on PATH, and
CONTEXTURE_BIN is not set"). This keeps the resolution ladder itself protocol-agnostic (it doesn't
need to know whether the caller wants JSON-on-stdout or stderr-plus-exit-1) while still giving the
operator a specific, actionable reason rather than one generic message for every possible failure.

Once resolved, the command is invoked by capturing its output rather than a bare `exec`: a resolved
path can still fail to execute (a dangling symlink, a file that lost its executable bit between
resolution and invocation), and `exec`'s own 126/127 exit would reach the harness as an ordinary
"hook errored" — the exact fail-open shape this change exists to close. The write-gate maps exactly
126/127 to `ctxr_unavailable`; every other exit code and stdout byte is relayed unchanged, so
`ctxr adapters write-gate`'s own deliberate "I couldn't decide, apply normal permission flow" exits
(never 2, per its doc comment) keep their documented meaning untouched.

Write-gate's `ctxr_unavailable` emits the same
`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}` shape
`ctxr adapters write-gate` emits for an out-of-scope edit, then `exit 0` — never `exit 2`.
`src/commands/adapters-write-gate.ts`'s own doc comment explains why: Claude Code treats exit 2 as
a hard block regardless of output, and this gate is designed to degrade to "deny with a reason"
rather than an opaque block whenever it can't complete its evaluation. Reusing the same decision
shape (rather than inventing a second deny format) is also directly testable: a task in this
change's `tasks.md` asserts the wrapper's fail-closed body and the command's own out-of-scope deny
body agree on `hookEventName` and `permissionDecision`, so the two can't silently drift apart.

*Alternative considered*: `permissionDecision: "ask"`. Rejected — this control's whole purpose is
unattended enforcement across sessions (including non-interactive/agent-driven ones, which is the
exact deployment the filed issue was found in); "ask" degrades to escalating to the ambient
permission mode with no human present to answer — in a container running with edits auto-accepted,
that ambient answer is *allow*, i.e. the same silent fail-open this change closes, just one hop
removed. A `deny` that names the fix is strictly better whether or not a human is watching.

`ctxr_unavailable()` drains stdin (`cat >/dev/null 2>&1 || true`) before printing its deny body and
exiting: the normal path only reads stdin inside `ctxr adapters write-gate`, so a caller writing the
full tool-call envelope to this script's stdin without first checking its exit code would otherwise
see its own write fail (EPIPE/SIGPIPE) the moment this script exits without ever reading it —
observed directly in this change's own integration tests before the drain was added. Pre-commit's
`ctxr_unavailable()` needs no equivalent: git does not pipe a payload to a pre-commit hook's stdin.

Pre-commit's `ctxr_unavailable` writes a stderr message naming the fix (mirrors the existing
"commit refused — staged changes failed" phrasing) and exits 1 — pre-commit hooks have no
structured-output protocol to match, unlike the write-gate; a nonzero exit is git's own native
"refuse this commit" signal, and `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH`'s sibling escape hatch on
`pre-push.sh` already establishes that this store is honest about hooks being bypassable
(`--no-verify`), not a cage — pre-commit's message says so explicitly.

**4. One shared partial (`templates/hooks/_resolve-ctxr.sh`), inlined via a new
`__RESOLVE_CTXR__` substitution, rather than duplicating the ladder in both templates.**

`writeRenderedScript()`'s own doc comment already states the codebase's standing discipline: "one
write path, never duplicated." The resolution ladder is identical between the two hooks (env
override with an executable-vs-`.js` dispatch, then `PATH`, then `ctxr_unavailable`); a future
third hook (any harness beyond Claude Code that declares a `hookFile`) gets the same substitution
for free by defining its own `ctxr_unavailable` and using the same token, rather than copy-pasting
the block again — which is exactly how this bug had two, both-wrong copies of the same eight lines
to begin with. The underscore prefix marks it a non-hook partial; neither `HOOK_SPECS` (git hooks)
nor any `hookFile.templateFileName` in an adapter ever names it directly, so it's never installed
as a standalone script. It is inlined at render time (not shipped as a second tracked file the
hooks `source`) because the two hooks live in different directories (`.githooks/` vs.
`.claude/hooks/`) — a sourced file would need its own resolvable relative path between them,
reintroducing a path problem one level down, plus a second tracked file whose own absence becomes
a new fail-open mode. Inlining also keeps each hook a single self-contained file, which is what
keeps `detectStaleHooks`'s whole-file byte comparison working unchanged.

A `CONTEXTURE_BIN` that resolves to a non-executable file (a plain `dist/bin.js` from `tsc`, which
does not set the executable bit — only npm's own bin-linking does) is dispatched through `node`
when `node` is itself resolvable on `PATH`; otherwise that, too, calls `ctxr_unavailable`. An
override that is set but names something that doesn't exist at all is terminal at that rung — it
does **not** fall through to `PATH` — because a set `CONTEXTURE_BIN` is a deliberate pin, and
silently substituting a different binary the operator didn't ask for would defeat the point of
pinning one.

**5. `resolveOwnBinPath()` is deleted, not deprecated.**

Its doc comment's stated premise — "baked into the generated hooks so they invoke the exact
contexture that installed them, sidestepping the global/local/npx distribution question entirely"
— is exactly the premise this change reverses. Nothing else in `src/` calls it (confirmed: the
only two call sites are `renderHook()` and `adapters-generate.ts`'s `PermissionConfigInput`
construction, both changed here). Dead code left in place invites a future regeneration path to
reintroduce the same bug by reaching for it out of habit.

`binPath` is dropped from `PermissionConfigInput` (`src/adapters/types.ts`) for the same reason;
`root`/`mainRoot` stay exactly as `stabilize-write-gate-hook-path` left them — this change touches
only how the *script itself* finds `ctxr`, never how its *path* is referenced from
`.claude/settings.json`. `SUPPORTED_ADAPTER_INTERFACE_VERSION['harness-generation']` is not bumped:
v1 resolves adapters from contexture's own built-in registry only (`src/adapter.ts`'s doc comment),
so no third-party adapter can be reading `binPath` yet, and bumping the interface version would
needlessly refuse stores over a field removal nothing external could depend on.

## Risks / Trade-offs

- **A store that had `ctxr` un-resolvable before this change now gets refused writes/commits where
  it previously got silent warnings.** → Intended: this is the fix. The failure is now loud
  (a deny reason naming the fix, or a commit refusal) instead of silent, and both retain their
  existing bypass (`--no-verify` for pre-commit; the write-gate's underlying decision command
  already documents that hooks are gates, not cages).
- **`command -v ctxr` finds *some* `ctxr` on `PATH` that isn't the one the operator expects**
  (e.g. two installs, only one current). → Accepted: this is the same trade-off every other shipped
  skill already makes (`templates/skills/ctxr-*.md` instruct agents to run bare `ctxr` off `PATH`
  with no path resolution at all) — the hooks are now consistent with that, not a new risk class.
  `CONTEXTURE_BIN` remains the escape hatch for a caller who needs to pin a specific install.
- **A store's `.claude/hooks/claude-code-write-gate.sh` still carries the old baked path from
  before this change, on a machine without `doctor` self-heal for it.** → No new gap: this is the
  pre-existing "no staleness detection" non-goal, unchanged by this fix; the very next
  `ctxr adapters generate`/`ctxr update` (which every store already runs periodically) rewrites it,
  since `writeRenderedScript()` always overwrites when rendered content differs from what's on
  disk.
- **Integration tests that shell out to a rendered hook would, without care, silently resolve
  whichever `ctxr` happens to be on the test-runner's own `PATH`** once the hooks stop carrying a
  baked path — passing or failing based on the developer's machine state rather than the build
  under test. → The test harness (`test/helpers/git-env.ts`'s `hermeticGitEnv()`) must pin
  `CONTEXTURE_BIN` to the real built `dist/bin.js` by default for every integration test that
  exercises a hook end to end, so rung 1 is deterministic; a test that specifically wants to
  exercise the `PATH`-only rung opts out by unsetting it and providing its own shim directory on
  `PATH` instead. Recorded as its own task in `tasks.md` rather than left implicit, since it's easy
  to add the new fail-closed tests without noticing the existing ones became environment-dependent.
- **`.claude/settings.json`'s hook *command* itself still names an absolute path** (anchored at the
  store's main worktree, per the already-shipped `stabilize-write-gate-hook-path`) — unaffected by
  and out of scope for this change, but worth naming explicitly: if that file is ever regenerated
  before its own generating session's PR has landed, Claude Code can fail to find the *script* at
  all and never reach any of this change's logic (the archived change's own "Risks" section already
  accepts this as a one-time bootstrap-window gap, scoped to a store's very first generation). After
  this change ships, that settings.json path is the only machine-anchored byte left anywhere in the
  generated output — a natural next target if it's ever revisited (for example, Claude Code's
  `$CLAUDE_PROJECT_DIR` hook-command expansion could plausibly remove the need for `mainRoot`
  entirely), but re-arguing that archived decision is its own change, not folded in here.

## Migration Plan

No explicit migration step. `writeRenderedScript()` (`src/core/hooks.ts:48-60`) already
compares freshly rendered content against what's on disk and rewrites on any difference — so the
very next `ctxr init` (git hooks) or `ctxr adapters generate`/`ctxr update` (write-gate hook) after
this ships rewrites every existing store's hooks to the portable form, with no separate command or
flag. Rollback is likewise just reverting the templates/source and regenerating again.
