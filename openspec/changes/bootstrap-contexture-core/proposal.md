## Why

Every AI agent harness re-invents how it remembers, organizes, and finds context, and that memory is locked to the harness. A working alternative already exists as a personal, unreleased setup (`~/workspace/pkm`): a plain-markdown, git-backed store with a harness-agnostic convention doc, portable procedures, and a fail-closed access model, proven across 351 notes and months of use by multiple agent harnesses and a nightly automation. contexture generalizes that proven shape into an open-source context store — plain files, any agent, ingested/organized/retrieved the same way regardless of which harness is driving.

This is the founding change: it establishes the full core spec surface so the CLI, procedures, and conventions that follow all build on one coherent contract rather than accreting capability-by-capability.

## What Changes

- Define a context store as a git repository governed by a single `contexture.yaml` (taxonomy, field keys, exclusion sets, branch prefixes, forge config) and a canonical harness-agnostic `AGENTS.md`.
- Establish the code/judgment seam: agents read and synthesize directly against plain files; the CLI's sole job is exhaustive/byte-stable computation, validated writes, checks that fail, and git/session lifecycle. No capability may specify a check enforced only by an agent following an instruction.
- Ship retrieval with three legs and no ranker: a coverage-guaranteed catalog, a deterministic wikilink graph, and ripgrep — plus an adapter seam so a ranked/semantic engine can be added later without re-deciding note identity.
- Split visibility (pre-filter, fails closed, a property of a note) from disclosure (tri-state ALLOW/DENY/ASK, walls-before-allows, a property of an output) as two capabilities, because they have contradictory defaults.
- Require every write to land through a CLI-owned session (git worktree) and merge via reviewed PR — nothing commits to the default branch, enforced by version-controlled hooks, not by agent compliance.
- Include a durable agent-identity layer (posture, world facts, user facts) as a first-class capability, excluded from retrieval, injected per-harness by adapters.
- Define one adapter contract covering all four extension points (search, harness generation, identity injection, forge) so core never depends on an adapter being present.
- **BREAKING**: N/A — greenfield project, no prior contract exists.

## Capabilities

### New Capabilities

- `context-store`: the store's git-repository foundation, `contexture.yaml` as single source of truth for taxonomy/field-keys/exclusions, note frontmatter schema, the derived-vs-authored rule, and the marker-fence convention for machine-written regions.
- `harness-portability`: `AGENTS.md` as the canonical entry document, root resolution precedence, procedures as portable markdown reached by path, and an executable portability test run with no harness state present.
- `cli-contract`: exit-code taxonomy, the `--json` output envelope and its stability guarantee, and the fail-loud error contract shared by every command.
- `context-visibility`: resolution of a note's visibility (explicit → directory default → fail-closed to the configured default context) and enforcement as a pre-filter applied before any retrieval leg runs.
- `disclosure-policy`: the ordered walls-before-allows ladder governing whether a note's content may flow to an external party, returning a tri-state ALLOW/DENY/ASK verdict with distinct exit codes.
- `context-catalog`: the curated, coverage-guaranteed, sectioned catalog that is the primary ranking mechanism in a no-ranker retrieval design.
- `context-retrieval`: the deterministic wikilink graph (path-derived identity, reported dangling links, fatal identity collisions) and ripgrep content matching, plus the leg-routing rule and the stable per-note record consumed by future ranked engines.
- `context-ingest`: capture into an inbox with no source identity, the ingest procedure's post-conditions, source-identity fields, and two-stage content-addressed dedupe with a stop-don't-guess rule on multi-match.
- `context-organize`: note placement, archive as a single tracked rename, and a lint that reports without failing a build.
- `agent-identity`: the always-injected identity/memory layer, its boundary against retrievable knowledge, and portable content with harness-owned wire formats.
- `adapters`: the single contract — discovery, versioning, capability declaration, missing/incompatible behavior — governing search, harness-generation, identity-injection, and forge adapters.
- `store-lifecycle`: idempotent `init`, a `schema_version` gate, and named/dry-runnable/resumable migrations.
- `store-integrity`: `doctor`, the machine-readable system-health check that fails on real invariant violations (staleness, drift, collisions, unlabeled notes, hook/adapter health).
- `write-lifecycle`: the session-worktree write container, the default-branch guard enforced by version-controlled git hooks, the append-via-queue mechanism for shared append-only files, and atomic derived-artifact writes.

### Modified Capabilities

None — greenfield project, no existing specs.

## Impact

Affected: none yet (planning-only change; no code exists in this repository before this change). This proposal defines the contract that `src/`, `procedures/`, `templates/`, and adapter generators will implement under a following `/opsx:apply`. Establishes the npm package surface, the `contexture.yaml` schema, the `AGENTS.md` template, and the git-hook/session model that all future contexture changes build on.

## Non-goals (v1)

Deliberately not shipped, to keep the core contract honest about scope — see `design.md` "Risks & explicitly cut" for the evidence:

- A plain-directory (non-git) store mode. Git is required substrate.
- Any bundled ranked/semantic search engine. v1 ships the adapter seam, not an implementation of it.
- A hardcoded PARA taxonomy, or any hardcoded set of visibility-context names. Both are configured defaults, not primitives.
- The audience *registry* syntax (venture-namespaced values, marker-fenced registries validated at graph-build time) — v1 keeps the disclosure ladder's shape with a flat, user-defined value list.
- Named relation-type vocabulary baked into a requirement (e.g. upstream/downstream/similar/opposing) — configurable, with defaults.
- mtime-based staleness/"hotness" scoring as a requirement; at most an optional lint heuristic.
- Journals/daily-notes as a distinct taxonomy layer.
- A hard sandbox (container/OS-level) guaranteeing agents cannot edit files directly. contexture guarantees the default branch is gated, not that direct edits are impossible.
