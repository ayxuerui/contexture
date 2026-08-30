## Why

The first in-place migration of a mature store (52 operator skills, months of use across several harnesses) was audited skill by skill against what contexture ships. The finding that matters: contexture's four owned skills are *mechanically complete but reasoning-empty*. `ctxr-placement` is four lines with no decision procedure; `ctxr-connection-finding` traverses links but cannot propose one; the rollup skill says "commit your synthesis" without saying what shape a synthesis takes; nothing tells an agent when a session has produced something durable, how to land a reviewed PR, or how to treat a generated artifact it is about to regenerate. The migration target had all of that written down — as generic reasoning that happened to live in one vault — and every store contexture initializes is missing it.

Seven of the audited skills are generic enough to ship inside contexture and be delivered to every store by `init`/`update`, and they need no new CLI surface: they are procedure text against commands that already exist. This change ships them. The CLI primitives the same audit exposed (a merge verb, an append-into-region write, dedupe drift verdicts, typed edges, a leak scan) are a separate change (`store-primitives-from-migration-audit`) so that this one stays text-only and lands first.

## What Changes

- **`ctxr-placement` gains a decision procedure**: ordered questions (layer → location within it → sub-item vs new top-level → visibility), a termination test for layers whose description implies an end state, default-to-sub-item with a promotion trigger written into the note, visibility as a placement input that may override location, the *visibility-collision merge test* (two locations with different visibility defaults must not be merged — a merged location has no safe default), perishable-vs-durable content routed to a fenced region rather than accumulated, and "match the style of one or two sibling notes before writing." All expressed against the store's configured taxonomy and contexts, never a shipped profile's names.
- **New `ctxr-connection-proposal`** (link *discovery*, complementing traversal): read the note, extract its concepts, search the store, read each candidate before proposing, group proposals by the store's configured relation vocabulary (falling back to a single "Related" group), confirm before writing, report nearby orphans.
- **New `ctxr-rollup`**: resolve-never-create, refuse non-entities (dated notes, infrastructure files), push back below a minimum source count, read every source not a sample, a default section template with skip-when-empty, provenance rules (every fact traceable to a source note; no editorializing).
- **New `ctxr-session-lifecycle`**: start → mandatory re-scan before planning → capture pass → surgical staging → fire gate before any external side effect (push, PR open, merge) → submit → land → verify-before-retry, plus the rebase-onto-default conflict playbook and multi-PR sequencing. Merging is described against the forthcoming `session land`; until it exists the skill names the manual equivalent.
- **New `ctxr-session-capture`**: trigger and anti-trigger taxonomy for end-of-session capture, the durable-content checklist, a one-message three-block proposal (store notes / world facts / user facts) with per-item identifiers and per-item approval, a secret-marker pass on proposed content, the identity-has-higher-blast-radius rule ("when in doubt between a note and identity, pick the note"), and reporting from actual write results.
- **New `ctxr-derived-artifacts`**: check before build, read back and sanity-check counts, never hand-edit inside a `contexture:` fence but hand-editing outside is fine, keep derived artifacts out of content commits, path-scope commits, verify the remote rather than trusting "it's merged."
- **`ctxr-organize-audit` and `ctxr-ingest-orchestration` gain the audited discipline**: for organize, move-don't-tag when retiring, visibility travels unchanged, verify tracked renames; for ingest, read the existing cluster before writing, the new/update/merge/restructure decision table, hub and bridge checks against `graph query`, and the thesis-change rule (when new material contradicts a note, patch its top-level conclusion first, then hunt now-stale verdict language).
- **BREAKING**: N/A — additive skill content; existing stores receive it on the next `ctxr update`.

## Capabilities

### Modified Capabilities

- `harness-portability`: the set of contexture-owned skills grows from four to eight, and each carries the audited decision procedure rather than a bare command sequence.

## Impact

Affected code: `src/core/procedures.ts` (skill content only — no new commands, no schema change), tests asserting skill content. Delivered to existing stores by `ctxr update` (managed copies are overwritten). The migration target's corresponding vault skills shrink to vocabulary overlays once these land.

## Non-goals

- Any new CLI command or config field (deliberately deferred to `store-primitives-from-migration-audit`, so this change is pure skill text and can ship first).
- Shipping the migration target's operator-specific skills — external-service connectors, a research methodology, retrieval over a third-party index, HTML artifact tooling, identity propagation across a machine, domain-specific logging vocabularies. Each is either bound to one operator's tools or is not a store operation; the audit record in `design.md` names every one and why.
- An activity ledger (`log.md`-style append-only journal): git history plus the catalog is the design, not a gap.
- Unattended/cron execution mode: harness orchestration, not a store procedure; `session start|submit|reap` is already its skeleton.
