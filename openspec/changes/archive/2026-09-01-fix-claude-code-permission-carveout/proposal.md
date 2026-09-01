## Why

The Claude Code harness adapter's permission-config generator (`src/adapters/harness/claude-code.ts`) emits a `deny: [Edit(//<root>/**), ...]` rule paired with an `allow: [Edit(//<root>/.worktrees/**), ...]` carve-out, meant to satisfy the archived requirement "deny Write outside the active session worktree." Claude Code evaluates deny before allow with no exception mechanism, so the carve-out can never fire: a session opened at the store root cannot edit *anything* in the tree, including the session worktree the write-lifecycle depends on. The generator also emits four `Write(path)` rules that Claude Code silently never consults (it checks `Edit`/`Read` path rules only), producing startup warnings for no effect. Because the merge writer is append-only, every store that has already run `adapters generate` keeps the broken rule forever, even after the generator code is corrected. This blocks the one harness the write-lifecycle's worktree model was designed around.

## What Changes

- Replace the unrepresentable deny/allow carve-out with a **PreToolUse hook**: a generated shell script, wired into `.claude/settings.json`, that pipes Claude Code's tool-call envelope to a new `ctxr` subcommand which resolves the target path and denies edits under the store root but outside the active session worktree.
- The new gate subcommand reuses the store's existing path gate (`sanctionedPath`, `src/core/write-lifecycle/path-gate.ts`) composed with a worktree-scope check, so the Claude Code gate and the pre-commit path allowlist can never disagree.
- Drop the four inert `Write(path)` permission rules entirely; keep the two `Bash(git push:*)` / `Bash(git commit:*)` deny rules unchanged.
- Give the harness permission-config generator a **retired-rules** declaration and teach the JSON merge writer to remove exact-match legacy entries before unioning in the current set, so a store that already generated the broken config is repaired (not just newly-generated ones), by exact string match only (hand-added rules are never touched).
- Extend the JSON merge writer to also merge an object-array section (`hooks.PreToolUse`) by matching contexture's own entry structurally, since the existing writer only unions string arrays.
- Ship a new hook script template (`templates/hooks/claude-code-write-gate.sh`), following this repo's existing git-hook-shipping pattern (`src/core/hooks.ts`, `templates/hooks/*.sh`).

## Capabilities

### Modified Capabilities
- `adapters`: adds a requirement covering what a harness's generated permission config must (and must not) do — deny outside the active session worktree without disabling the worktree itself, never emit a rule the harness cannot enforce, and repair a previously-generated file rather than leaving stale rules in place.

## Impact

Affected code: `src/adapters/harness/claude-code.ts` (new `render()` output, new `retiredRules()`), `src/adapters/types.ts` (widen `permissionConfig`'s render input; declare an installable hook file), `src/commands/adapters-generate.ts` (pass the wider context, install the declared hook script), `src/core/json-config-merge.ts` (exact-match removal pass; object-array section merge), `src/core/write-lifecycle/path-gate.ts` (new worktree-scope predicate composed with `sanctionedPath`), a new `ctxr` subcommand for the gate, and `templates/hooks/claude-code-write-gate.sh`.

Affected stores: any store that has run `ctxr adapters generate` (or `ctxr update`) with the Claude Code adapter configured gets its `.claude/settings.json` repaired on the next run — the broken deny/allow pair is removed and the hook-based config is written. A store that has never run generation is unaffected until it does. `.claude/settings.json` itself is untracked (generated but never committed by `init` and not gitignored either), so this only ever governs a Claude Code session whose project directory is the store root; a session opened directly inside a `.worktrees/<session>/` checkout loads no project settings and is unaffected either way.

## Non-goals

- **Projecting settings into session worktrees.** A worktree-local `.claude/settings.local.json` written at `session start` would extend this protection to sessions opened inside the worktree itself. Plausible future work; this change only repairs the existing root-level generation.
- **Intercepting Bash output-redirect writes** (`echo x > file`). Claude Code checks those against `Edit` permission rules, not against a PreToolUse hook on the Edit/Write/NotebookEdit matcher, so this hook cannot see them. Closing that gap needs a Bash-matcher hook with shell-command parsing, a materially different mechanism.
- **Bumping the harness-generation adapter interface version.** `permissionConfig` is optional and only this repo's built-in adapters exist today, so widening its render input is a non-breaking addition, not an interface change.
