## Context

See `proposal.md` — Why. This change is the record of a design decision reached by argument rather than by audit, so the argument is preserved here in full: a later reader deciding whether to re-add any of these axes needs the reasoning, not just the diff.

The starting position was narrower than the outcome. The two shipped axes — visibility and disclosure — were to be deferred to P2 on the grounds that neither is doing real work today, and the question left open was whether the third, proposed axis (scope) should be built now. D1 and D2 record why it should not, and that argument turned out to be the load-bearing one: it is the reason the removal is clean rather than partial.

## Decisions

### D1 — Scope is not redundant with the access axis; it is redundant with the graph

`separate-scope-and-name-the-axes` argues that scope and visibility are two capabilities because their defaults contradict: an unplaced note should still be findable (fail open), an unclassified note should not be readable (fail closed). That argument is sound, and it has a stronger sibling the proposal makes almost in passing — **cardinality**. Visibility is single-valued because multi-valued permission "would immediately raise 'most permissive or least permissive wins,' a question with no safe default" (its own D2). Relevance is naturally many-to-many. So using the access label as a relevance partition imports a restriction that exists purely for permission reasons and is wrong for relevance. Against visibility alone, scope wins.

But that framing admits only two ways to narrow a query, and contexture has four:

| The need | The mechanism that already serves it |
|---|---|
| notes in this area of the store | `--under <prefix>`, taxonomy layers, `retrieval.exclude_paths` |
| notes about this thing (many-to-many) | `[[wikilinks]]` → `graph neighbors` / `graph query` |
| notes containing this text | the ripgrep leg |
| notes I may see | the visibility field |

Scope is a hand-maintained, nominal, multi-valued relevance label proposed for a store that already has a hand-maintained, nominal, multi-valued relevance mechanism — the wikilink graph — alongside a positional one and a content one. And the graph beats scope on scope's own strongest dimension: it is already multi-valued, already enforced as a pre-filter, and **derived from content** rather than depending on an author remembering to label every note.

The test that should settle any future re-entry, recorded here so it does not have to be re-derived: **name a query you want to run that `--under`, the graph, and ripgrep together cannot express.** A genuine cross-cutting facet — "everything touching my employer, across every directory, whether or not those notes link a common hub" — would qualify, because position can file a note only once and links connect only notes that happen to share a hub. If the candidate examples all reduce to "notes under this directory" or "notes linking this entity," scope has not earned re-entry.

### D2 — Scope's one real advantage collides with the P2 role model

The thing an access *label* cannot express, and scope can, is multi-valued membership. But a role *grant list* is multi-valued as a matter of course: `viewer: [work, research]` is unremarkable in a role model, because a list of grantees has an obvious semantics that a single classification label does not. So the P2 direction recorded in D5 absorbs scope's distinguishing advantage.

Building scope now would mean arriving at P2 holding two overlapping nominal label systems on the same notes, with a reconciliation problem entirely of our own making. Rejected.

### D3 — Note frontmatter is not rewritten; the key is left inert

The migration removes the `visibility:` and `disclosure:` blocks and `fields.visibility` from `contexture.yaml`, and touches no note.

`parseNote` reads frontmatter into `Record<string, unknown>` and no consumer will read the retired key, so a dangling visibility field costs nothing at runtime — it is inert data, not a broken reference. Stripping it would be the more thorough-looking choice and the worse one: this removal is explicitly a deferral, and deleting the labels would make re-entry a hand re-labelling pass over every note in every store. Leaving them makes the removal cheap to reverse, which is the property that justifies doing it now rather than waiting for certainty.

Rejected alternative: rewrite every note to strip the key, for a clean store. A clean store is not worth a one-way door.

### D4 — Exit codes 4 and 5 stay reserved

`src/core/exit-codes.ts` allocates `DisclosureDeny` (4) and `DisclosureAsk` (5) and its header states the table "is allocated once, here, and is never extended by guessing a number under pressure in a later phase." Removing their only consumer does not make them free. They stay in the table, unused, documented as reserved — so that a P2 disclosure mechanism finds them waiting rather than finding them reassigned to something unrelated.

### D5 — This is a sequencing decision, not a judgment that access control is unnecessary

Recorded explicitly, because a bare removal reads as a rejection to anyone who finds it later.

There is a real need, and it is concrete: a published page built for a company must not carry an internal note evaluating that company. Two things serve it, neither of which is any of the three axes removed here.

1. **Roles — owner / editor / viewer.** The subject-side model, which the removed axes never had. Its most valuable piece is the one with no equivalent in the current design at all: **`owner`**, as accountability rather than permission — who a disclosure question routes to, who is named when lint reports a stale rollup, who reviews the change. Nothing in the store records this today.
2. **A pattern scan at `publish check`.** Configured patterns that must not appear in a built `index.html`. This is the cheap part and the honest part: it needs no axis, no per-note label, and no context mapping, because it checks the artifact that actually leaves the store rather than the notes that fed it.

Note also what the removal costs in principle, so the cost is on the record: the disclosure ladder's genuinely valuable invariant was that an external verdict is never derived from visibility alone — broad internal visibility never implies external disclosure. Any P2 role model must not quietly reintroduce that inference, because a role model has no natural place to put a destination and will tend to collapse the two. The pattern scan in (2) is deliberately artifact-side for this reason.

### D6 — Three pending changes are retired with the axes, not edited

- `separate-scope-and-name-the-axes` — retired. It is the scope proposal; D1 and D2 are its refusal.
- `rollup-respects-visibility` — retired. It is entirely a visibility pre-filter for `rollup gather`; with no visibility field there is no leak of the kind it describes. Its underlying observation is still true and worth preserving in whatever P2 change lands: `rollup gather` is the one enumeration that synthesizes across notes without any per-note gate, and a role model will have to decide what that means.
- `isolation-and-egress` — retired. Its central primitive, a projection containing "only notes both axes admit," has no axes left to admit anything. The corpus-isolation insight it rests on — that isolation is enforced by controlling what enters a corpus, not by labelling what leaves it — is independent of the axes and should be re-derived in a future change rather than half-preserved in this one.

Editing all three to survive the removal was considered and rejected: each would be reduced to a premise-less fragment, and a reader would have to reconstruct which parts still stood. Retiring them and citing them here keeps the reasoning findable without keeping three misleading artifacts alive.

### D7 — The 1 -> 2 visibility-field rename migration is retired, not kept as a version bump

`rename-visibility-field` existed to rename the visibility frontmatter key from `scope:` to `lens:` on
every note. With the field itself gone, that rename moves one inert key to another inert key — and it
does so by rewriting **every note in the store**, which is precisely the churn D3 refuses. Keeping it
would also leave it as the last file in the codebase hardcoding a frontmatter key literal, which
`store-lifecycle`'s "no component hardcodes a taxonomy or field name" requirement exists to discourage.

Retiring it leaves a gap in the version chain, and that is fine: `pendingMigrations` selects on
`fromVersion >= current`, never on adjacency, and every migration guards on `schema_version < N`
independently. A schema-1 store's first pending migration becomes the 2 -> 3 one, which carries it
straight to 3 and then on to 7. Nothing distinguishes a v1 store from a v2 store except the spelling of
a key nothing reads.

Rejected alternative: keep it as a no-op that only bumps `schema_version` to 2, preserving a contiguous
chain. That trades a real deletion for a migration whose entire behaviour is to set a version number one
higher, immediately before another migration sets it higher again — dead weight that a later reader has
to re-derive the harmlessness of. `store-lifecycle` requires migrations to be named, dry-runnable, and
resumable; it does not require the chain to be contiguous.

## Risks / Trade-offs

- **A specified capability is being deleted rather than implemented.** `context-catalog`'s `--as` omission requirement was never met by shipped code; this change resolves that gap by removing the requirement rather than by writing the filter. That is the honest direction given the decision, but it should be named plainly: the store ends this change with strictly less access control than its specs previously claimed, and slightly less than it actually had (the graph pre-filter, which did work).
- **`publish gather` loses its reason to exist as a distinct command.** Gate-less, it is an enumeration that `--under` and the backlink walk already perform elsewhere. It is kept because `publish` is a coherent command group and the enumeration is still the right entry point for the skill that builds a page — but if it stays unused through the P2 work, it should be cut then.
- **`compose-store-guidance-documents` collides on the `doctor` requirement.** That pending change carries a MODIFIED block for `store-integrity`'s "`doctor` is machine-readable and fails on real invariants" — the requirement this change removes and replaces under a new name — and its check list names the visibility check this change deletes. It is *already* invalid on its own (`openspec validate --all --strict` reports it omitting two scenarios, before this change existed), so it needs a pass regardless. Whichever change lands second must rebase its delta onto the other's result; this one records the conflict rather than silently winning it. It is not retired, unlike the three in D6 — its subject is guidance documents, and only this one requirement overlaps.

- **Every store requires `ctxr migrate`.** Accepted; the migration is config-only, and no note changes.
- **Reversal cost is not zero, even with D3.** The labels survive, but the resolution order, the context mapping, and the pre-filter would have to be rewritten. D3 preserves the data, not the code. This is judged acceptable precisely because the P2 model is expected to differ in shape from what is being removed — the code would have been rewritten anyway.

## Migration Plan

1. Land the code removal and the config-schema change together — a schema without the blocks and a codebase still reading them cannot both be correct at any commit.
2. `drop-access-axes`, keyed `fromVersion: 6`, following the registry's existing `<verb>-<noun>.ts` naming rather than the `NNNN-` prefix `separate-scope-and-name-the-axes` assumed. It removes two config blocks and one field key, and rewrites no note.
3. Update `openspec/config.yaml` last, once nothing in the tree contradicts it: the Tenancy paragraph, the "naming is deliberately postponed" paragraph, the three visibility-field-key authoring rules, and the archive-time literal-key audit all describe removed machinery.
4. Delete the two retired spec directories after archiving this change, since a capability with zero requirements is not a valid spec state.

Rollback: revert the migration commit. Stores that already migrated carry a `contexture.yaml` without the blocks; re-adding them restores prior behavior, and no note was touched (D3).

## Open Questions

None. Three assumptions were made without a blocking answer and are cheap to reverse if wrong: `publish gather` survives gate-less rather than being deleted (see Risks); the publish-time pattern scan is deferred rather than built here (D5); and the visibility field key is left in note frontmatter rather than stripped (D3).
