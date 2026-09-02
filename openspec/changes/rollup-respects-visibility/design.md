## Context

See `proposal.md` — Why. Found by auditing a mature store's design notes against contexture's specs before
retiring them: the vault had specified scope-filtered rollups, retired its own implementation on migrating
to `ctxr rollup`, and the native command never had the filter. The notes are being deleted, so the
requirement is being restated here rather than lost with them.

Existing mechanisms this uses — nothing new is needed:
- `src/core/notes/visibility.ts` — `resolveVisibility(config, note)` and `canSee(config, context, value)`.
- `src/commands/publish-gather.ts` — already composes exactly these two for its `--as` selector; the
  filtering shape is proven in-tree.
- `src/core/graph/visibility-filter.ts` — the graph leg's pre-filter, the precedent for filtering an
  enumeration before it is traversed rather than after.

## Goals / Non-Goals

**Goals:**
- Close the one enumeration that can carry content across a visibility boundary.
- Fix the requirement that should have caught it, so the next operation without an `--as` flag is not
  exempt by the same reasoning.
- Change no command's signature and add no config.

**Non-Goals:** see `proposal.md` — Non-goals (directory-default over-permission check, ingest backfill,
retrieval leak measurement, `--as` on rollup, changes to `rollup write`).

## Decisions

**D1 — The entity supplies the context; there is no new flag.** A rollup is written *into* the entity note,
so the only coherent audience is whoever can see that note. Alternative considered: `rollup gather --as
<context>`, mirroring `publish gather`. Rejected — the destination is fixed, so a caller-supplied context
could only ever be wrong in one of two ways: narrower than the entity (a rollup missing sources for no
stated reason) or wider (writing content into a note that cannot hold it, which is the bug). `publish
gather` legitimately takes `--as` because its destination is a page the caller chooses; rollup's is not.

**D2 — Fix `context-visibility`'s requirement, not just `context-organize`.** The narrow fix is one new
requirement about rollup. That would leave the general rule still saying "operations that accept a
requesting context," under which the *next* enumeration without a flag is equally exempt — the reasoning
that produced this gap, left in place. The requirement is about not leaking; whether the operation happens
to take an argument is an implementation detail of one command, not a boundary of the rule.

**D3 — Ahead of `separate-scope-and-name-the-axes`, not inside it.** That change (0/26, unstarted) splits
the field into a `context-scope` selector and a narrowed `context-visibility`, and would rework the exact
requirement modified here. Folding this in would be tidier on paper. Rejected on two grounds: the leak
exists in shipped code now and that change has not begun, so this would inherit an unstarted change's
timeline for no reason; and the two are separable — this one says *rollup must apply whatever the visibility
rule is*, which stays true verbatim after the axes split, since the split changes what visibility means and
not whether rollup honors it. If the axis work lands first, this requirement needs its wording aligned but
not its substance revisited.

**D4 — Fail closed on an unresolvable entity.** If the entity note's own visibility cannot be resolved, the
gather returns nothing rather than everything. Consistent with `context-visibility`'s fail-closed default
and with `context-projection`'s "an unresolvable note is omitted rather than included." The alternative —
treating unresolvable as unrestricted — makes the failure mode of a config error a leak.

## Risks / Trade-offs

- **A rollup silently gathers fewer sources than its author expects.** → The gather command reports the
  resolved set and its count; a source dropping out is visible in that output. Worth stating in the
  release note, since an entity whose rollup previously drew on out-of-visibility notes will synthesize
  differently on the next run.
- **Two other commands share the same backlink enumeration** (`rollup stale`, `publish gather --entity`).
  → `publish gather` already gates every note through disclosure, so it is covered by a stronger check;
  `rollup stale` only compares timestamps and never surfaces content, so a visibility filter there would
  change which entities are *reported* stale without protecting anything. Both should be re-read when the
  code is open, and the conclusion recorded, rather than assumed.
- **Broadening the pre-filter requirement could implicate operations nobody has audited.** → That is the
  intent, and it is why this is a spec change and not only a code fix: any such operation is a leak today.
  Implementation should enumerate the callers of `listNotes` and state, per caller, whether it enumerates
  on behalf of a requesting context.

## Migration Plan

Additive to behavior, no schema or config change. No migration: a store gets the filter on its next
`rollup gather`. Existing rollup *content* is unchanged — this governs what future gathers return, and
does not retroactively audit or rewrite what past rollups synthesized.
