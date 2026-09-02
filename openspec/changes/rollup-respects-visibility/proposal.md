## Why

`ctxr rollup gather <entity>` enumerates every note that links to an entity and hands the whole set to an
agent to synthesize into that entity's note. It applies no visibility filter — `src/commands/rollup-gather.ts`
resolves backlinks and returns them, with no reference to visibility, `canSee`, or a requesting context.

That makes it the one enumeration in the store that can move content across a visibility boundary. A note
visible only to `ctx-a` can be read, summarized, and written into an entity note that `ctx-b` can see; the
synthesized text carries no marker saying where it came from, so nothing downstream can undo it. Every
other leg refuses this by construction: graph traversal excludes invisible notes before the first hop,
catalog entries carry resolved visibility, and `publish gather` runs a disclosure verdict per note before a
word is copied out.

The gap has a traceable origin. This behavior was specified in the vault contexture was generalized from —
*"a `scope: brightstar` entity rollup pulls from `scope ∈ {brightstar, shared}` only… this preserves the
persona filtering"* — and its scope-filtered rollup skill was retired when that vault migrated onto
contexture's native `ctxr rollup`, on the assumption the native command already did this. It does not.

`context-visibility`'s pre-filter requirement is what should have caught it, and the reason it did not is
worth fixing directly: it is scoped to operations that *accept* a requesting context, "via an `--as <context>`
argument or equivalent." `rollup gather` accepts no such argument, so the requirement reads as not applying —
an operation is exempt precisely because it never asks who is asking. That is the wrong shape for a rule
about leaks.

## What Changes

- Broaden `context-visibility`'s pre-filter requirement to cover any operation that enumerates notes on
  behalf of a requesting context, **whether that context is supplied as an argument or derived from the
  operation's own subject**. Being unable to name a requester stops being an exemption.
- Add a `context-organize` requirement: `ctxr rollup gather` SHALL exclude notes the entity's own resolved
  visibility cannot see, before returning the set. The entity note supplies the context — no new flag.

## Non-goals

- **A directory-default over-permission check.** `lint` reports notes that fall through to the fail-closed
  default — the under-specified case. Nothing reports the opposite: a note inheriting a directory default
  that grants *more* visibility than the note would get on its own, which is the direction that leaks. Real,
  and worth its own change; it is a new check with its own findings and thresholds, not a line in this one.
- **Opportunistic `source-hash` backfill.** A Stage-1 ingest match against a note carrying no `source-hash`
  could stamp it as a write-through, making legacy notes visible to Stage-2 dedupe without a manual pass.
  Belongs to `context-ingest`, unrelated to visibility.
- **Retrieval leak measurement.** `retrieval-legs-hardening` already designs a `retrieval-quality` capability
  with leak-gates-at-zero and states the gap plainly — "there is still no measurement of retrieval at all."
  A test proving *this* fix holds belongs with that work, not duplicated here.
- **Adding `--as` to `rollup gather`.** The entity's own resolved visibility is the correct context; letting
  a caller name a different one would invite generating a rollup under a context the entity does not have.
- **Changing what `rollup write` accepts.** The CLI still writes bytes an agent produced and never
  synthesizes; this changes what the agent is given to read, not who writes.

## Capabilities

### Modified Capabilities

- `context-visibility`: the pre-filter requirement covers derived requesting contexts, not only ones passed
  as an argument.
- `context-organize`: `rollup gather` is stated to apply that pre-filter, with the entity supplying the context.

## Impact

Affected code: `src/commands/rollup-gather.ts` (filter the resolved backlink set through `canSee` /
`resolveVisibility`, both already exported from `src/core/notes/visibility.ts` and used by
`src/commands/publish-gather.ts`'s `--as` selector — no new primitive). `ctxr rollup stale` and
`ctxr publish gather --entity` share the same backlink enumeration and should be checked for the same gap
while the code is open.

Affected stores: a rollup run after this change may gather fewer sources than before. That is the point, but
it means an entity whose rollup previously drew on notes outside its visibility will synthesize differently
on the next run — worth stating in the change's own release note rather than discovering silently.
