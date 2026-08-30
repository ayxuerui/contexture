## Why

End-of-session capture — turning what a session produced into store notes and durable identity facts — is the operation with the highest blast radius in a store, and today contexture ships it only as instructions (`ctxr-session-capture`). The migration target still needs its own overlay skill because three things contexture cannot do: put the identity files where the store's runtime actually reads them (its live identity lives under a harness-managed directory, not `identity.path`, and one of its files is entry-delimited rather than sectioned); enforce the write-path rules the capture procedure states (repo-relative, no symlink escape, only under sanctioned locations); and apply an approved proposal as one verified operation whose report comes from real writes. Every one of those is a store primitive, not a vault opinion. The decision: capture becomes a function contexture provides.

## What Changes

- **`ctxr session capture --proposal <file>`** applies an approved capture proposal: creates or appends store notes, applies identity deltas, and reports what was actually written, refused (with the reason), or skipped — per item, never all-or-nothing. It performs no scanning or judgment; the agent produces the proposal, the user approves it by item, the command executes exactly the approved items.
- **Configurable identity file locations.** `identity.files` maps the three identity roles (posture, world facts, user facts) to store-relative paths, defaulting to `<identity.path>/<canonical name>`. A file may live outside `identity.path`, including under a directory a harness runtime links into. Every consumer of identity — ensure-on-init, the retrieval exclusion invariant, identity injection adapters, the entry document's identity section, and capture — uses the resolved paths.
- **Entry-based identity edits.** Identity files are sequences of entries separated by a configurable delimiter line (`identity.entry_delimiter`, default: a blank line; a heading-structured file works unchanged). `ctxr identity add|replace|remove --file <role>` appends an entry, or replaces/removes the single entry matching a unique substring — refusing on zero or multiple matches. Capture's identity deltas use this primitive.
- **Write-path gate.** A staged or captured markdown path SHALL resolve inside the store without traversing a symlink that escapes it (always enforced), and — when `write_lifecycle.writable_paths` is declared — SHALL fall under a configured taxonomy layer, the inbox, a declared writable path, or a contexture-owned location. The existing `staged.path_allowlist` check enforces it at commit time; `session capture` enforces it per item before writing.
- The `ctxr-session-capture` skill's Apply step becomes: write the approved items to a proposal file and run the command; the report is the command's output.
- **BREAKING**: N/A — new command; `identity.files`, `identity.entry_delimiter`, and `writable_paths` default to today's behavior.

## Capabilities

### Modified Capabilities

- `agent-identity`: identity file locations and entry delimiter are configurable; entries can be added, replaced, and removed by command.
- `write-lifecycle`: the path gate (symlink escape always; sanctioned-location allowlist when declared) and the capture command that applies an approved proposal.
- `harness-portability`: the session-capture skill drives the command instead of describing manual writes.

## Impact

Affected code: `src/config/schema.ts` (`identity.files`, `identity.entry_delimiter`, `write_lifecycle.writable_paths`), `src/core/identity.ts` (resolved paths, entry model), new `src/commands/identity.ts`, new `src/commands/session-capture.ts`, `src/core/checks/write-lifecycle-checks.ts` (`staged.path_allowlist` gains the symlink and sanctioned-location rules), `src/core/checks/identity-checks.ts` (exclusion check over resolved paths), `src/adapters/**` identity injection, `src/core/agents-doc.ts` (identity section), `src/core/procedures.ts` (session-capture skill), `src/run.ts`, `openspec/specs/cli-contract`. Supersedes the identity-mutation item of `store-primitives-from-migration-audit`, which is trimmed accordingly. The migration target retires its capture overlay once this lands, pointing `identity.files` at its runtime's directory and setting its delimiter.

## Non-goals

- Scanning a session or deciding what is durable — judgment, and therefore the skill's job, per the code/judgment seam; the command never reads a transcript.
- Any harness-specific memory mechanism — identity is files; a runtime that wants them injected uses an identity-injection adapter, and a runtime that writes them itself simply shares the path.
- Auto-trigger infrastructure (hooks, spools, daemons) for capture — the skill's trigger taxonomy stays behavioral.
- Committing on the agent's behalf — captured notes ride the session worktree and `session submit`, as everything does.
