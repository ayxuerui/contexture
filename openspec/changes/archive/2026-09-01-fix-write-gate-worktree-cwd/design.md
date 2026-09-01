## Context

See proposal.md - Why for the defect and the reproduction. Facts that shape the approach:

- `openStore` (`src/core/store.ts`) resolves `root` via `resolveExistingRoot` (`src/core/root.ts`): `--root` flag, then `CONTEXTURE_ROOT`, then walk up from `cwd` for the nearest `contexture.yaml`. `adapters-write-gate.ts` calls this with `cwd` taken straight from the PreToolUse envelope, never the canonical store root — there is no other root available to it.
- `ctxr session start` clones the full working tree into the new worktree, `contexture.yaml` included (it is ordinary tracked content, not something `init` excludes from a worktree checkout). So a worktree is, from `resolveExistingRoot`'s point of view, indistinguishable from a second independent store — it has its own `contexture.yaml` at its own top level.
- git itself already draws this exact distinction, and does it without a subprocess: the main working tree's `.git` is a directory containing the full repository; a linked worktree's `.git` is a plain text file whose content is `gitdir: <path to .git/worktrees/<name>>` (documented in `git-worktree(1)`). `src/core/git/repo.ts` already holds every other git-repo predicate this store uses (`isInsideGitRepo`, `hasGitIdentity`, …), all subprocess-based via `GitRunner` — but this one gate call happens on every single gated tool call, so a subprocess round-trip is worth avoiding when a two-syscall filesystem check answers the same question.
- `isWriteInScope` (`src/core/write-lifecycle/path-gate.ts`) already composes on `resolveStorePath`'s three-way `outside_store | symlink_escape | inside` result; the fix is one more branch in that same function, not a new resolution path.

## Goals / Non-Goals

**Goals:**
- Make `isWriteInScope` return `inScope: true` for any write whose resolved `root` is a linked worktree checkout, regardless of `relativePath`, closing the gap against the adapters spec's existing "active session worktree editable" scenario.
- Keep the canonical checkout's protection exactly as strict as before — the new branch must never fire when `root` is the main working tree.
- No subprocess in the hot path; detection stays synchronous filesystem access, consistent with the rest of `resolveStorePath`'s symlink handling (which already uses sync `existsSync` for the ancestor walk).

**Non-Goals:**
- Not changing `resolveExistingRoot`'s walk-up behavior, or teaching it to prefer a canonical root over a worktree's own `contexture.yaml` — every other command's root resolution correctly wants "the nearest store," and a worktree genuinely is one. The fix belongs in the one call site that actually cares about the distinction (the write gate), not in shared root resolution every command relies on.
- Not extending the carve-out to `sanctionedPath` (the pre-commit / session-capture gate). That gate answers a different question — "is this specific path a sanctioned write location within whatever store `root` is" — and is correct as-is whether `root` is a worktree or the canonical checkout; nothing about worktree-vs-canonical changes which paths are sanctioned to write. Only `isWriteInScope`'s question ("is this a session-worktree write versus a canonical-checkout write") depends on which kind of checkout `root` is.

## Decisions

### Detection: a git worktree, not the store config's `worktrees_path`

Considered and rejected: checking whether `root`'s basename or some ancestor segment matches `config.session.worktrees_path`. This would require ANOTHER config read to answer a question about `root` itself, breaks under `session.workspaces_external: true` (worktrees an external process places anywhere, not necessarily under the configured prefix — exactly the pkm vault's own configuration), and answers "does this path look like a worktree" rather than "is this actually one." Checking `.git`'s file-vs-directory shape answers the real question directly, for any worktree wherever it lives, using a mechanism git itself defines rather than a naming convention this store invented.

### Placement: `src/core/git/repo.ts`, not inline in `path-gate.ts`

`repo.ts` is already the one place every other git-repo predicate lives, and it will host the same predicate reused elsewhere (`doctor`'s reporting, a future `session list` sanity check) rather than duplicated. `isWriteInScope` imports it like any other module boundary. It stays a standalone exported function rather than a method on `Store`, since `Store.config` is already loaded by the time this needs to run but `Store` carries no notion of "is my root a worktree" today and adding one would be a wider, unrelated change.

### Fail-closed on a missing or unreadable `.git`

`isLinkedWorktreeRoot` returns `false` (not a linked worktree — so the existing, stricter, denial path still applies) whenever `statSync`/`readFileSync` throws, rather than treating an error as "assume worktree, allow it." A store root that has no `.git` at all, or one this process can't read, is exactly the case where the gate should keep its default, more conservative answer.

## Risks / Trade-offs

- A store that runs `ctxr session start` outside contexture's own mechanism (a hand-rolled `git worktree add`) still gets the correct answer, since the detection is git's own on-disk convention, not anything contexture writes — no migration or config change needed for existing stores.
- This does not, by itself, make the pkm vault's `.claude/settings.json` exist inside every worktree checkout (it remains untracked, per `fix-claude-code-permission-carveout`'s own non-goals) — it only makes the gate answer correctly on the invocations that do reach it, wherever that hook is wired up.
