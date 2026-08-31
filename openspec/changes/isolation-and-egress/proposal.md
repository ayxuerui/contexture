## Why

A per-note label only withholds content from readers that consult it. Contexture's visibility field is genuinely enforced — as a pre-filter, on the legs contexture computes — but that guarantee stops at the CLI boundary, and nothing today can hand another tool a subset of the store that is safe by construction rather than by the other tool's cooperation.

This is not a hypothetical. GBrain shipped per-page `visibility:` frontmatter and reports in `docs/architecture/brains-and-sources.md` that it has "no query filters on it"; real protection there means placing content where a caller holds no grant. Its working isolation primitive is a source marked `federated=false`, to "isolate a topic so it never leaks into personal search." The transferable conclusion is that **isolation is enforced by controlling what enters a corpus, not by labelling what leaves it.**

Two supporting gaps come from the same source. GBrain's private-page filter "folds into the query-cache key, so trusted and untrusted runs never share cache rows" — a derived artifact built for one requester and read by another is a leak, and Contexture is currently safe only because no derived artifact is built per-requester yet. And the requesting context is supplied per invocation with no resolution chain behind it, so omitting it silently means no filtering at all, where every other resolved input in the store has a documented precedence order and a fail-loud ending.

## What Changes

- Add a **projection**: a derived, filtered materialization of the store for a named requesting context and optional scope, containing only notes both axes admit. Because the excluded notes are never written, no downstream consumer can surface them regardless of how it indexes or synthesizes.
- Require any per-requester derived artifact to be **keyed by the requesting context and by the scope selector**, so content produced for one requester is never read as though produced for another.
- Require a **secret-pattern scan before materialization**, applying the check that today runs only when content is committed to the point where content leaves the store tree.
- Give the requesting context a documented **resolution precedence chain**, so filtering stops depending on someone remembering a flag on every invocation.
- Extend the adapter contract: an adapter that is **declared but registers nothing** exits non-zero, matching the existing treatment of an incompatible version and preserving the distinction between an absent adapter (documented degradation) and a broken one (loud failure).

## Capabilities

### New Capabilities

- `context-projection`: a filtered, derived materialization of the store for a named requester — what it contains, how it is keyed, what is checked before it is written, and why it, rather than a label, is the boundary an external index sees.

### Modified Capabilities

- `context-visibility`: the requesting context resolves through a documented precedence chain rather than an argument alone.
- `adapters`: a declared adapter that registers nothing is refused for the same reason an incompatible version is.

## Impact

Affected code: a new projection command and its build, the note enumeration and combined pre-filter it reuses, the secret-pattern scanner (today invoked only from the commit path), configuration for the projection's derived path and the context resolution chain, and the adapter registry's resolution failure handling.

Affected stores: additive. A store that never runs the projection command is unchanged; the resolution chain preserves today's behavior when a context is passed explicitly.

Depends on `separate-scope-and-name-the-axes` for the scope selector and the combined pre-filter, and reuses `write-lifecycle`'s existing guarantees for declared derived paths (atomic write, gitignored, never staged, never in a review diff) rather than restating them.

## Non-goals

- **Making the requesting context mandatory.** Flipping that default breaks every existing invocation that omits it. This change ships the resolution chain and the reporting that lets an operator see what a store would resolve to; requiring it is a separate, deliberately breaking change once stores have bindings to resolve.
- **Per-caller authentication.** A resolved context records intent, not proof of identity. The store is single-owner, and per the project's "gate, not a cage" rule the only assertable guarantee concerns the legs contexture computes — a caller who can run the CLI can name any context.
- **Any search, ranking, or index built over a projection.** The projection is specified as a corpus; what consumes it is the deferred D2 work and gets its own change. Specifying a consumer here would commit to an adapter contract this change has no evidence to design.
- **A disclosure ledger recording what left the store.** Genuinely valuable and drawn from the same source's audit-redaction discipline, but it is an audit capability with its own retention, integrity, and privacy requirements. Folding it in would make this change two changes wearing one name.
- **Untrusted-content classification at ingest.** The observe-only guardrail seam is a real gap, but it belongs with ingest's trust model rather than with corpus isolation.
