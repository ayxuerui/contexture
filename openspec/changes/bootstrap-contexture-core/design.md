## Context

See `proposal.md` — Why, and the 14 spec deltas under `specs/` for the full requirement set. This document explains the shape those specs take and why, and records the risks and trade-offs that shaped the cuts from the source vault (`~/workspace/pkm`) this project generalizes from (clean-room; not copied, not modified).

Three architectural choices run through every capability and are worth stating once instead of re-deriving per spec:

1. **Agents read; the CLI computes, writes, and verifies.** Source gathering, cluster reading, synthesis, and placement judgment are procedure markdown — an agent does these directly against plain files, and no CLI layer improves on Read/Grep. The CLI exists only for what an agent cannot do reliably: byte-stable derivation, idempotent fence-validated writes, checks that fail rather than decay, and git/session lifecycle.
2. **Git is required substrate, and every write is review-gated.** A context store is a git repository. Nothing commits to the default branch; every write lands through a CLI-managed session (an isolated worktree) and merges via a reviewed pull request. This is also the concurrency answer: isolation, not locking.
3. **Enforcement is a gate, not a cage.** Contexture cannot stop an agent with Write and a shell from editing a file directly, and git hooks are bypassable with `--no-verify`. The only claim any spec makes is narrower and true: nothing reaches the default branch un-gated.

## Goals / Non-Goals

**Goals:**
- Establish a complete, internally consistent core contract in one change, so later changes (CLI implementation, procedure pack, adapters) build on a settled foundation rather than discovering seams mid-implementation.
- Make the two deliberately postponed naming decisions (the visibility field's key, the store's root noun) genuinely deferrable — a config default change plus a migration, never a spec rewrite.
- Keep every enforcement claim honest: a requirement is only written where a concrete mechanism (a hook, a non-zero exit, a pre-filter) backs it.

**Non-Goals:**
- Implementing any of this. No code, `package.json`, procedure files, or templates exist yet; that is the scope of the following `/opsx:apply`.
- Deciding the exact `contexture.yaml` file format, CLI flag spelling, or TypeScript module boundaries — those are implementation details the specs deliberately leave open (see "Quick test" in the specs instruction: if implementation can change without changing observable behavior, it isn't in the spec).
- Migrating `~/workspace/pkm` to consume contexture. It is design evidence and a failure record only, per the locked "clean-room build" decision; it stays untouched.

## Decisions

### D1 — Split visibility from disclosure into two capabilities
`context-visibility` (pre-filter, binary, fails closed, a property of a note) and `disclosure-policy` (tri-state ALLOW/DENY/ASK, evaluated per intended output, defaults to asking a human) have contradictory defaults. Merging them produces a capability where "the fail-closed rule" is ambiguous between "hide silently" and "ask a human" — an ambiguity real enough that pkm avoids it by keeping `scope-visibility` and `audience-policy` as two specs. Alternative considered: one `access-policy` capability with two requirement groups — rejected because a spec is meant to be a single coherent behavior contract, and "evaluate strictly in this order across both mechanisms" cannot be stated correctly when the two mechanisms disagree on default behavior.

### D2 — Retrieval ships three legs and no ranker in v1
Catalog (curated, coverage-guaranteed), graph (deterministic, structural), and content matching (literal, ripgrep-equivalent) are unranked. A ranked/semantic engine is a documented adapter seam, not a v1 requirement. Alternative considered: require a bundled BM25 index from day one — rejected because it adds a persistence format, an indexing step, and a staleness concept to every one of the 14 capabilities' test surfaces before the core contract (store, visibility, write path) is even proven. The catalog is deliberately promoted to its own capability (`context-catalog`, not folded into organize) because with no ranker, the catalog *is* the ranking mechanism — see Risks below for why this is the single riskiest bet in this design.

### D3 — Node identity is path-derived, not stem-derived
`context-retrieval` requires two notes with the same filename in different directories to produce two distinct graph nodes, and requires the build to fail loud on any identity collision. This directly targets an observed failure mode in the source vault's build script, where node identity is the bare filename stem and a real collision (two unrelated notes both named the same thing) is silently merged. Alternative considered: keep stem-based identity for simplicity and rename-tolerance — rejected because silent merging of two unrelated notes' content is worse than the inconvenience of a slightly longer identifier.

### D4 — Capture and ingest are split, and capture assigns no source identity
`context-ingest` requires a captured (not-yet-ingested) file to carry none of the source-identity fields. This avoids a specific false-drift bug class: if a captured file and the note it produces both carried the same source-id, a dedupe check comparing "existing notes" against "the file that is about to become a note" would find its own future output and misreport a duplicate. Making capture identity-free by construction removes the bug rather than requiring a check to guard against it.

### D5 — One adapter contract, four adapter kinds
Search, harness-file generation, identity injection, and forge integration are different concerns but the same shape: discoverable, versioned, capability-declaring, and such that core has documented behavior when the adapter is absent. Alternative considered: let each of the four capabilities that touches an adapter (retrieval, harness-portability, agent-identity, write-lifecycle) define its own ad hoc extension mechanism — rejected because that produces four different answers to "what happens when this plugin is missing," which is exactly the kind of inconsistency that erodes the "any agent, right now" promise the moment a user tries the second adapter kind.

### D6 — Write path: session worktrees + review-gated PR, not advisory locks
Concurrency is resolved by isolation (each session gets its own worktree and branch) rather than by locking a shared working tree. This mirrors observed reality in the source vault, which runs many concurrent worktrees precisely because agents and cron jobs write at overlapping times; locking would serialize work that doesn't need to be serialized. Shared append-only files (a chronological log, for instance) are the one case two branches genuinely cannot both modify without conflict, so those use an append-via-queue (a uniquely named intent file, applied by a reconciling operation) rather than either locking or requiring the two sessions to coordinate branches directly.

### D7 — Naming inoculation is a config-key requirement, not a documentation convention
The visibility field's frontmatter key is asserted as a requirement in exactly one place (`context-store`, reading `fields.visibility` from `contexture.yaml`), and every other spec is required to say "the visibility field" rather than the literal key. This is enforced by an `openspec/config.yaml` spec-authoring rule, not left to author discipline alone, because the whole point of postponing the naming decision is that a future rename must be a config-default change plus a migration — not a grep-and-replace across 14 specs.

## Risks / Trade-offs

- **[Risk] The no-ranker retrieval bet is the riskiest decision in this design.** With no ranker, there is no path to a note that is genuinely about a topic, never uses the query's literal vocabulary, and whose catalog gloss doesn't use it either — a silent recall miss with no detection mechanism. → **Mitigation**: the catalog's coverage invariant (`context-catalog` — `doctor` fails, not warns, on any gap) keeps the ranking-by-catalog approach honest; the size-budget requirement makes "this leg is breaking down" a measured, mechanical trigger (a section exceeding its configured limit) rather than a felt one; the stable per-note record (`context-retrieval`) means adding a real ranker later doesn't require re-deciding note identity from scratch.
- **[Risk] Requiring git costs real reach.** A context store that is not a git repository is entirely out of scope for v1 — there is no plain-directory mode. → **Mitigation**: this is accepted, not hidden — recorded explicitly in the proposal's Non-goals. The trade buys reviewable writes, real history on every relocation, and worktree-based concurrency safety, which the alternative (advisory locks on a shared tree) does not provide as cleanly.
- **[Risk] Plain files are readable without the CLI, which means the visibility pre-filter is bypassable by an agent that greps the store directly instead of calling `search --as`.** → **Mitigation**: accepted as the cost of the "agents read; CLI writes/verifies" split, which is what keeps the store operable without the CLI at all. `doctor` is required to report notes that would leak if grepped raw, and the exclusion set is documented in `AGENTS.md` as a convention on top of being enforced in `search --as`. This residual risk is stated in the proposal's Non-goals rather than implied away.
- **[Risk] Enforcement hooks are bypassable with `--no-verify`, and no spec claims otherwise.** → **Mitigation**: review (the pull request) is the layer that does not depend on hook cooperation — a human or second agent sees the diff regardless of how it was committed. The spec for `write-lifecycle` is written against "nothing reaches the default branch un-gated," which review alone already guarantees even if every hook were removed.
- **[Trade-off] Cutting pkm's PR-routing granularity (which changes deserve their own PR vs. riding with other work) and its branch-prefix vocabulary out of the spec.** These are real, useful conventions in the source vault, but they are policy choices about workflow ergonomics, not product requirements — they become configuration defaults in the shipped taxonomy profile, not testable requirements in `write-lifecycle`.
- **[Trade-off] Cutting the audience *registry* syntax** (venous-namespaced values, marker-fenced registries validated at graph-build time, membership/exclusion fields) in favor of `disclosure-policy`'s ladder *shape* with a flat, user-configured value list. The ladder ordering and the tri-state ALLOW/DENY/ASK verdict are the generalizable product primitive; the registry syntax is one operator's org chart.

## Migration Plan

This change has no runtime to migrate — it is the founding spec set for a project with no prior implementation. The relevant "migration" is procedural: once `tasks.md` exists and is approved via `/opsx:apply`, implementation proceeds phase by phase (see `tasks.md`), each phase ending in a runnable command, so that the project is never left in a state where the specs describe behavior the code cannot yet demonstrate for more than one phase at a time.

The one substantive future migration this design deliberately sets up is the visibility-field rename (D7): `store-lifecycle` requires migrations to be named, dry-runnable, and resumable, and this design records that the field-key rename should be the first migration exercised end-to-end against a fixture store, specifically to prove that the naming-inoculation strategy in D7 actually holds before real users depend on it.

## Open Questions

None. Every ambiguity that would have changed a spec, a capability boundary, or the task sequencing was resolved with the user during planning (retrieval engine, identity-layer scope, code/judgment seam, write-path/git requirement, enforcement posture) rather than deferred here. The two genuinely deferred decisions — the visibility field's key name and the store's root noun — are not open questions in the sense of blocking implementation; D7 and the harness-portability spec's "exactly one root variable, no aliases" requirement make both safe to leave unresolved until a real need forces the choice.
