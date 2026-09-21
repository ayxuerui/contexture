## Why

`.claude/settings.json` is a tracked, committed file, and the write-gate hook command inside it is an
absolute filesystem path. An absolute path cannot be correct on two machines at once, so the committed
value is wrong for every machine except the one that last ran `ctxr update`, and it churns every time a
different one does.

Observed in a real store: the committed command was
`/home/ubuntu/workspace/pkm/.claude/hooks/claude-code-write-gate.sh`, a path that does not exist on the
machine now working that store. Running `ctxr update` there rewrote it to `/store/...`, which would in
turn break the first machine. Its history shows the flip-flop already happened, and at one commit the
path pointed inside a session worktree (`.worktrees/hermes-8f9cd81f/...`) — the failure
`stabilize-write-gate-hook-path` was written to end.

That predecessor fixed the worst version of this: it stopped anchoring the path at whichever checkout
ran the generator and anchored it at the main worktree instead, so the command survives its generating
worktree's removal. It did not — and could not, in that shape — make the value machine-independent. A
path is still baked in at generation time, so the file still cannot be shared.

The principle this needs is already in the adapters spec, applied one level too shallow. The spec
requires that the generated primitive *itself* carry no baked-in installation path and be "byte-identical
regardless of which machine or checkout generated it" — which is why the hook script resolves `contexture`
off `PATH` at run time instead of hardcoding it. The hook script obeys that rule. The command that
invokes the hook script does not.

Claude Code publishes the missing piece: `${CLAUDE_PROJECT_DIR}`, documented as a placeholder for
"the project root where the session started", expanded by the harness when the hook fires, and offered
precisely so hook commands can "reference hook scripts relative to the project root, regardless of the
working directory when the hook runs".

## What Changes

- The `claude-code` adapter's permission config invokes the write-gate hook as
  `${CLAUDE_PROJECT_DIR}/.claude/hooks/claude-code-write-gate.sh` rather than as an absolute path
  resolved at generation time. The generated `.claude/settings.json` becomes byte-identical on every
  machine, so committing it is finally correct.
- The adapters spec's invocation-path requirement is restructured: use the harness's own project-root
  placeholder when the harness provides one; fall back to the main-worktree-anchored absolute path only
  when it does not. The fallback, and the fail-closed rule beside it, are unchanged.
- `templates/conventions/baseline-conventions.md`'s sentence on this stops describing the absolute-path
  anchoring as the rule and describes the placeholder, so a store's regenerated conventions match what
  the generator emits.

Not breaking, and self-migrating. The existing config merge already matches a hook entry by
`(matcher, hook script basename)` and is deliberately blind to the path prefix, so the new command
replaces the old one in place on the next `ctxr update` — no duplicate hook, no accumulated stale entry,
and no `retiredRules` entry needed. The resolved behavior is strictly better than what it replaces: the
placeholder can never name a deleted worktree, because it is expanded against the project the harness
actually has open rather than baked when the config was written.

## Capabilities

### New Capabilities

None. The change lands on the existing `adapters` capability.

### Modified Capabilities

- `adapters`: the requirement governing how an enforcement primitive is invoked gains the
  placeholder-first rule and demotes the absolute path to a fallback; its worktree-removal scenario is
  restated in terms of the new mechanism, and scenarios are added for machine-independence and for
  converging a config that still carries a generated absolute path. The fail-closed requirement, the
  primitive's own no-baked-path requirement, and the repair/convergence requirement are untouched.

## Non-goals

- **Removing `mainRoot` from `PermissionConfigInput`.** It has no consumer left once this lands, but the
  spec still requires the absolute-path fallback for a harness that publishes no placeholder, so the
  input stays available for the adapter that next needs it. Argued in design.md D3.
- **Changing the hook script's own contents.** It already resolves `contexture` at run time with nothing
  baked in, which is the rule this change extends rather than revisits.
- **Changing what the hook enforces.** Same matcher, same script, same fail-closed behavior; only the
  string that names the script changes.
- **Auditing other generated files for absolute paths.** This fixes the one that is committed and known
  to churn. A general sweep is a separate question.
- **A `schema_version` bump, a config key, or a migration command.** Convergence happens through the
  merge that already runs on every `ctxr update`.
