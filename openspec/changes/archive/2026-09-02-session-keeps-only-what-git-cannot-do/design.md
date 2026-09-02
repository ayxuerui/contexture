## Context

See proposal.md - Why. The relevant existing shapes:

- `src/adapters/forge/github.ts` (101 lines): the only forge adapter implementation, wrapping `gh repo view` / `gh pr create` / `gh pr view --json` / `gh pr merge`.
- `src/commands/session-submit.ts` / `session-land.ts` / `session-abandon.ts` / `session-reap.ts`: the four commands being removed.
- `src/core/git/worktree.ts`: `hasRemote`, `fetchOrigin`, `addWorktree`, `parseWorktreeList`, `listWorktrees` (kept — creation and reading), `removeWorktree`, `deleteBranch`, `pruneWorktrees`, `mainWorktreePath` (removed with their last caller).
- `src/core/skills.ts`'s `reclaimingStep` (`skills.ts:214-231`), branching on `session.workspaces_external` to render one of two paragraphs into `ctxr-session-lifecycle`.
- `0004-rename-conventions-path-to-guidance-path` (`src/core/migrations/rename-conventions-path.ts`): the precedent this change's migration follows.

Confirmed with the user: nothing lands pull requests in this store unattended today — no cron job, no CI bot, no automation. Landing is always something an agent or a human does interactively. This is the condition the removal verdict depends on; a future unattended-landing requirement is the one thing that would justify rebuilding a `session land`-shaped command, and it should be checked against this note rather than re-derived.

## Goals / Non-Goals

**Goals:**
- State one seam that decides which `ctxr session` subcommands survive, so a future subcommand is judged by the same rule rather than case by case: the CLI keeps what computes something git cannot (a collision-free branch name, a validated note write, a config-derived worktree listing); sequencing git operations goes to skills.
- Leave `ctxr` with no command that performs a destructive git operation (branch deletion, worktree removal) after this change. Every such operation becomes something a human or agent types explicitly, in front of git's own refusals.
- Preserve every gate the removed commands enforced, re-expressed as skill steps naming the concrete `git`/`gh` invocation, not left implicit.

**Non-Goals:**
- Building a replacement `gh` wrapper under a different name — see proposal.md Non-goals.
- Changing the `harness-generation` adapter kind, `ctxr adapters generate`, or anything about `ctxr session start`, `list`, or `capture`'s own behavior.
- Deciding what a future ranked-retrieval adapter kind looks like. The adapter registration mechanism stays kind-generic for that reason (D4), but no second kind is added here.

## Decisions

**D1 — Where each guarantee re-attaches.** Every guarantee the removed commands are credited with is anchored somewhere that does not depend on them:

| Guarantee | Enforced today by | After this change |
| --- | --- | --- |
| Staged changes validated before commit | `templates/hooks/pre-commit.sh` → `doctor --staged` | unchanged |
| Nothing reaches the default branch un-gated | `templates/hooks/pre-push.sh` | unchanged |
| Whole store healthy before review | `session submit`'s own check pass | `ctxr doctor`, run by the `ctxr-submit` skill |
| A dirty worktree is not destroyed | `git worktree remove` refusing without `--force` | unchanged |
| An unmerged branch is not destroyed | `git branch -d` refusing | unchanged |
| Merge behind an explicit gate | `session land`'s interactive prompt | the `ctxr-land` skill's fire gate + PR review |

Two guarantees move from mechanism to instruction rather than staying mechanism: naming a real branch before pushing (was `session submit --branch`, becomes `git branch -m`) and the mergeability read before merging (was `session land`'s internal state machine, becomes an explicit `gh pr view` step). Per this project's rule that an "enforced" claim must name its enforcing mechanism, the harness-portability spec delta states these as what the skill instructs, not as something the tool guarantees.

**D2 — The migration must parse before it can migrate.** `readConfig` (`src/config/load.ts`) runs the full `StoreConfigSchema` before `ctxr migrate` can act. Tightening `AdapterKindSchema` to drop `forge`, or dropping `workspaces_external` from `SessionSchema`, outright would make an unmigrated store fail to load at all — a shape error instead of a migration opportunity. This mirrors exactly the problem `0004-rename-conventions-path-to-guidance-path` solved for a config-key rename: keep the schema permissive with a `.transform()` that accepts and silently drops both legacy shapes (a `kind: forge` entry in `adapters`, the `workspaces_external` key in `session`), so an unmigrated store loads as though they were already absent, while the migration itself rewrites the YAML on disk and bumps `schema_version`. Pending-ness is `schema_version < 5`, not key presence — the same rule 0004 established, for the same reason: a lenient schema can't distinguish "migrated" from "never had it."

**D3 — Why `session reap` goes, when it looked like the safest of the four.** Two arguments for keeping it were considered and both fail. *Concentration* — "it becomes the only command left that removes a worktree, so keep one tested path for the one irreversible operation" — is circular (scarcity is not value) and factually backwards: reap's own predicate only ever touched worktrees that were clean *and* fully merged, meaning both of its operations were always recoverable (a clean worktree's content is entirely in git; a merged branch's commits are reachable from the default branch). The operation that was actually irreversible was `session abandon`'s forced removal of a possibly-dirty worktree and a possibly-unmerged branch — and that command carried no session guard at all. *Config-derived scoping* — "hand-rolling reap's logic means reimplementing `isSessionWorktreePath`" — dissolves once `workspaces_external` is gone (D5): a session is then just "a worktree under `session.worktrees_path`," one value the skill-rendering system already substitutes into templates. Reap is also spec-orphaned: its only requirement, "External workspace ownership disables worktree reclamation," is the requirement removed in this same change. What actually justifies removing it: its clean/merged pre-checks duplicate refusals `git worktree remove` and `git branch -d` already make unprompted (it calls both unforced), so the checks buy a friendlier report, not any safety a hand-typed `git worktree remove <path>` lacks.

**D4 — What "one contract for every adapter kind" means with one kind.** `openspec/config.yaml` keeps the adapter seam intentionally general for a future ranked-retrieval engine ("an adapter seam allows a ranked engine later; v1 ships none"), so the registration mechanism (declare in `contexture.yaml`, resolve by kind+id against a registry, version-check before invoking) stays kind-generic rather than collapsing into a `harness-generation`-specific requirement. But the requirement's illustrative scenario — two kinds sharing one discovery mechanism — can no longer be written truthfully with one kind registered. The replacement scenario asserts the same mechanism from its refusal side (an unresolvable (kind, id) declaration is refused, not silently dropped), grounded in `AdapterNotFoundError`, which is already the tested behavior for an id that doesn't resolve under its declared kind (`test/unit/adapters-registry.test.ts`).

**D5 — `session.workspaces_external` is removed, not preserved for the one store that motivated it.** The key did two jobs. The reap-refusal half is moot once reap itself is gone (D3). The skill-rendering half never worked as shipped: `reclaimingStep`'s external branch states the skill "MUST NOT create, switch to, unlock, remove, or prune a worktree," but only the reclaiming section of `ctxr-session-lifecycle` was conditional on the key — its Start section, which reads "`ctxr session start` creates a worktree on a fresh branch off the fetched default branch; work there," was not. A store with the key set therefore received a skill that both instructed and forbade worktree creation in the same document. `test/unit/skills.test.ts` asserted only that the prohibition paragraph was present, never that the rendered document was internally coherent — which is how the defect shipped unnoticed. Removing the key leaves that store's rendered skill no worse than it is today, which is the argument that decides it, not merely the cost side: a schema slot, a default, an error class, a requirement each in `write-lifecycle` and `harness-portability`, a rendering branch, and `workspaces_external: false` repeated in roughly forty test fixtures, all serving a key whose originating proposal (`generalize-identity-migration-residue`) said outright it generalized from a single store. An operator who needs the underlying fact recorded — "worktrees here are managed by an external process" — has a home for it that was always available: an operator-authored file under `harness.guidance_path`, which the store's existing conventions-inlining mechanism (`inline-conventions-and-mission`) already surfaces in `AGENTS.md`, and which `ctxr update` never overwrites because it is not contexture-owned.

**D6 — Inverting the "never merge by hand" rule.** `templates/skills/ctxr-land.md` and the current `harness-portability` spec forbid any forge command appearing in the land skill, so every merge would route through one audited CLI path. With no such command, there is no path left to route through, and forbidding `gh pr merge` in its replacement would leave the skill unable to merge anything at all. The audit trail becomes the pull request and the merge commit themselves — both more durable records than a CLI invocation ever was, since they persist on the forge independent of which tool performed the merge. The harness-portability spec delta states this directly (D1's table), so a reviewer encountering "the land skill runs `gh pr merge`" reads it as the intended replacement mechanism, not as a regression the delta failed to catch.

## Risks / Trade-offs

- **[Risk]** The `test/unit/session-land.test.ts` suite (23 scenarios) is deleted along with the code it exercises, and a reviewer scanning test-count deltas alone will see a large negative number. → **Mitigation**: those scenarios ran against a mocked forge and a mocked git runner — they tested this codebase's own state machine against synthetic inputs it constructed, not behavior a user could observe independently. `proposal.md`'s Why section states this explicitly and names the three decisions (re-query on unknown mergeability, read-back after merge, head-mismatch refusal) that move into the `ctxr-land` skill rather than disappearing, so the loss is nameable rather than hand-waved.
- **[Risk]** An operator with an existing store loses `session.workspaces_external` and any prose they had leaned on it to avoid writing themselves. → **Mitigation**: the migration's dry-run output names the key being dropped; the write-lifecycle and harness-portability spec deltas each state the replacement (an operator-authored guidance file) in their Migration note.
- **[Risk]** Skill-markdown enforcement is inherently softer than a tested command — an agent can skip a skill step in a way it could not skip a command's internal check. → **Mitigation**: this is not a new risk introduced by this change. An agent that could decline to invoke `ctxr session land` at all, or pass `--yes` to skip its confirmation, already had the same latitude; D1 states plainly that the soft guarantees were always skill-mediated, and only the hard guarantee (pre-push hook) is claimed as tool-enforced both before and after.
- **[Trade-off]** `harness-portability`'s "Land never merges by hand" scenario is dropped rather than preserved, which a spec-diff tool will show as reduced restriction. → Accepted per D6: the restriction's purpose (one audited path) is better served by the pull request and merge commit than it ever was by a CLI wrapper, and restating the old ban would make the replacement skill non-functional.

## Migration Plan

1. Ship the lenient schema parse (D2) in the same release as the tightened types, so `readConfig` never rejects a pre-migration store.
2. Ship migration `0005`, bumping `SUPPORTED_SCHEMA_VERSION` to 5, stripping `kind: forge` adapter declarations and the `session.workspaces_external` key from `contexture.yaml`. `ctxr migrate --dry-run` reports both deltas by name.
3. Ship the rewritten `ctxr-submit`, `ctxr-land`, and `ctxr-session-lifecycle` templates, and the collapsed (unconditional) `reclaimingStep`, in the same release — `ctxr update` refreshes every existing store's skill copies to the new content.
4. No rollback path is provided beyond normal version pinning: this is a pre-1.0 breaking change with no deprecation shim, per proposal.md.

## Open Questions

None. The one deferrable-looking question — whether unattended PR landing ever becomes a real requirement — is not open; it is a documented condition of this decision (Context, above), not a question the design leaves for later.
