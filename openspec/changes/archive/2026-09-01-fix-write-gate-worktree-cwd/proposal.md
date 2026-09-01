## Why

`fix-claude-code-permission-carveout` replaced the unrepresentable deny/allow pair with a `PreToolUse` hook that pipes the tool call's envelope to `ctxr adapters write-gate`, which resolves the store root from the envelope's `cwd` (`openStore` → `resolveExistingRoot`, walking up for the nearest `contexture.yaml`) and calls `isWriteInScope(config, root, relativePath)`.

That resolution has a gap the archived change's own scenario already promises won't happen and doesn't test: **every session worktree carries its own copy of `contexture.yaml`** (`ctxr session start` clones the full tree). When a session's `cwd` is already inside the worktree — not the canonical checkout — `resolveExistingRoot` resolves *the worktree itself* as `root`, so `isWriteInScope` sees a target path relative to that root, finds it is not under `config.session.worktrees_path` relative to *itself*, and denies it. Verified directly against the built CLI before this change:

```
$ echo '{"cwd":"/home/ubuntu/workspace/pkm/.worktrees/session-20260831-220306-23c191","tool_name":"Edit","tool_input":{"file_path":"areas/x.md"}}' \
  | node dist/bin.js adapters write-gate
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny", …
```

This is exactly the scenario `adapters/spec.md`'s "A harness's generated permission config scopes writes to the active session worktree" requirement promises: "an edit to a file inside the active session worktree succeeds." It currently does not, whenever the session's own `cwd` is the worktree rather than the store root. It stays latent only because `.claude/settings.json` is untracked (never committed by `init`, generated only by `adapters generate`/`update`) — a store that has never regenerated it, or whose settings only live at the canonical root, never hits it. But a store with `session.workspaces_external: true` (worktrees provided by an external process, e.g. a WebUI) or any operator who commits or projects the generated settings into a worktree checkout would find every edit inside that worktree denied — the opposite of the write-lifecycle's intent.

## What Changes

- `isWriteInScope` (`src/core/write-lifecycle/path-gate.ts`) gains a carve-out: a `root` that is itself a linked git worktree checkout (not the repository's main working tree) is always in scope, before the final worktree-prefix denial.
- New sync detector `isLinkedWorktreeRoot(root)` in `src/core/git/repo.ts`, alongside contexture's other git-repo predicates — file-system only (checks whether `<root>/.git` is a file starting with `gitdir: `, exactly how git itself tells a linked worktree from a main working tree), not a subprocess, since the gate runs on every gated tool call.
- No config, template, or generated-file shape changes — this is a pure bugfix to the gate's own resolution logic.

## Capabilities

### Modified Capabilities
- `adapters`: the "scopes writes to the active session worktree" requirement gains a scenario covering a session whose `cwd` is already inside the worktree, closing the gap between what the requirement promises and what `isWriteInScope` actually decided.

## Impact

Affected code: `src/core/write-lifecycle/path-gate.ts` (`isWriteInScope`), `src/core/git/repo.ts` (new `isLinkedWorktreeRoot`), `test/unit/path-gate.test.ts`.

Affected stores: any store whose `.claude/settings.json` (or an equivalent per-worktree copy) has the generated `PreToolUse` hook wired in gets edits inside a worktree-rooted session correctly allowed on the next hook invocation — no regeneration or migration needed, since this only changes the gate's runtime decision, not anything written to disk. A canonical-root session's protection is unchanged: the carve-out only fires when `root` resolves to a linked worktree, never the main checkout.

## Non-goals

- Not projecting `.claude/settings.json` into worktree checkouts, or changing how/whether it gets committed — this fix makes the gate correct wherever it happens to run, independent of that open question.
- Not revisiting `fix-claude-code-permission-carveout`'s own stated non-goals (Bash output-redirect writes, a worktree-local `settings.local.json`).
