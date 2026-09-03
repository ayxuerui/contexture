## Context

See `proposal.md` — Why, and the two spec deltas under `specs/` for the requirement set.

Two prior decisions frame this one. `bootstrap-contexture-core` D2 ships two CLI-computed legs and no ranker, and names the resulting gap — a note whose body and gloss both avoid a query's vocabulary — as the design's riskiest bet. `retire-the-access-axes` D1 set the standing test any new narrowing axis must pass: name a query you want to run that `--under`, the graph, and ripgrep together cannot express. This change introduces no new axis; it composes two that exist, so that test does not apply and is recorded here as satisfied rather than argued.

The external evidence is GBrain's ablation and Karpathy's LLM Wiki, both cited in the proposal. The useful part of the ablation is not its absolute numbers, which belong to a different corpus and a different stack, but its ordering and its architecture: the graph outperformed the embedding leg, and it did so as an augmentation over other legs' candidates rather than as a peer answering alone. Contexture already has the deterministic graph. What it lacks is the augmentation step.

## Goals / Non-Goals

**Goals:**
- Compose the catalog and the graph, which the store's own routing prose already instructs an agent to do and no code performs.
- Make the store's withholding guarantee true, and enforced at the seam rather than asserted in prose.
- Give ordering a home, so archived material can be ranked last without being made invisible.
- Keep the no-ranker line closed, visibly and with a stated tripwire.

**Non-Goals:**
- Improving recall against any vocabulary. The pass composes structure; it cannot reach a note that nothing links to and no section lists, and this design does not claim it can.
- Measuring anything. That is the next change, and it lands second for the reason in D9.
- Any network call, model call, index server, or dependency.

## Decisions

### D1 — Retrieval is one pass with several entry points, not three legs you choose between
The menu framing is what makes the graph a peer you consult *instead of* the catalog, and that is the configuration GBrain's ablation scores lowest. The pass framing makes the graph the expansion layer over whatever entered, which is where the measured precision came from. It also makes the store's existing routing prose honest: that prose already describes a pipeline, and has never been able to compute its middle step. **Alternative considered:** keep the menu and make the choice between legs computable, as the superseded change proposed — rejected, because both cited systems describe a pipeline rather than a menu, and because computing the choice puts a reading judgment inside the CLI, against the code/judgment seam.

### D2 — The pass takes selectors, never a query string
This is the single sentence that keeps D2 closed, so it is a requirement rather than a convention. With no query there is no note-against-query relevance to define, tune, or degrade, and therefore nothing that could grow into a ranker by increments. **Alternative considered:** accept a query and match it against catalog glosses — rejected: that is a ranker with one feature, and it would reopen D2 through the smallest available door while inheriting the exact failure mode D2 names.

### D3 — Ordering is a lexicographic tuple over structural facts, and the precedent is already shipped
The order is `(tier, hops, entry-reason, path)`. `tier` is an operator declaration; `hops` is a count of graph edges; entry-reason is an index into a list frozen in the specification; `path` guarantees totality. No coefficient, no float, nothing corpus-derived, nothing tunable. The project has already accepted this kind of ordering: `graph query bridges` computes a score and sorts on it, and `hubs` orders by backlink count, both inside a capability whose purpose says the graph "enumerates structure and ranks nothing." Ordering by a structural integer is settled here as not-ranking; this change composes existing ordering kinds rather than introducing a new one. **Alternative considered:** GBrain's actual design, multiplicative boosts with a floor-ratio gate — rejected: a weight is a tunable, and a tunable demands a metric to tune against, which is a ranker's development loop arriving by the back door.

### D4 — Every result carries evidence labels; nothing carries a number
A result names why it is present — the seed it came from, whether it entered by section, prefix, backlink, or link direction, and how many hops away it sits. It never carries a confidence. This is GBrain's "evidence labels, not blended scores," and it survives translation better here than there: with no scores to blend, the labels are the whole output rather than an explanation bolted onto one. It is also the surviving half of the routing command this change drops — report the reason, not just the verdict — which turns the output into a computation an agent can audit rather than an oracle it must trust. **Alternative considered:** a single combined confidence value — rejected: a combined value is a score wearing a different word, and a label *set* is what makes a miss debuggable, which is the risk the superseded change's own mitigation named.

### D5 — Qualifier labels describe a result; they never order it
`hub`, `bridge`, and `no_gloss` are reported and ignored by the sort. `no_gloss` is the one genuinely new signal and it is nearly free: it makes D2's named failure mode visible *per result* rather than invisible in aggregate. A pass returning eight `no_gloss` notes is telling the agent, at the point of use, that the catalog leg is thin right there. **Alternative considered:** promoting hubs in the order — rejected: hub-ness is a property of the store's shape, not of this request's relevance, and promoting it is a relevance judgment. It is already actionable as a label.

### D6 — Exclusion-respect replaces the deleted leak gate, and it is load-bearing today
With a single owner, `retrieval.exclude_paths` and the tool-owned prefixes the enumeration adds are the whole of "must not surface" — so exclusion is the honest heir to the leak gate: same shape, same fail-closed posture, defined over a mechanism that exists. It is not a formality. `loadGraph` reads the persisted graph and returns it unchecked, so every graph query today can serve a note the store no longer admits. **Alternatives considered:** *determinism* — rejected, already required of every derived artifact in three specs, and a consistently wrong answer is deterministic, so it fails on nothing anyone would call a leak. *Catalog coverage* — rejected, already a `doctor` invariant, and `store-integrity` forbids classifying one condition twice. *Ambiguous links at zero* — rejected, already shipped as an invariant, and it is link hygiene rather than a withholding property.

### D7 — The loader refuses an over-inclusive graph; it never silently drops from one
Failing is narrow and deliberate: a graph missing a *new* note is under-inclusive and withholds nothing, so it stays a `doctor` observation. A graph carrying a note the store no longer admits is the leak, and it fails the query. **Alternative considered:** post-filter the persisted graph against the enumeration — rejected on the project's own rule that a pre-filter cannot be safely retrofitted from a post-filter, and because silently dropping would conceal exactly the staleness the operator needs to fix.

### D8 — The command is `ctxr context gather`
`gather` is the established verb for agent-facing enumeration that computes no judgment; `rollup gather`'s own doc comment says it "does not read or synthesize," and this command holds to the same line. `context` is the concept noun the capabilities already use. **Alternatives considered:** `ctxr graph gather` and `ctxr catalog gather` — both rejected for filing a deliberately cross-leg mechanism inside one leg, which is the separation this change exists to close. `ctxr retrieval gather` — rejected as tautological at the point of use. A bare `ctxr gather` — rejected because every other command group is noun-then-verb.

### D9 — Measurement is sequenced *after* this change, reversing the superseded plan
That plan put measurement first so improvements could be scored against a pre-change baseline, and it was right about aliases and wrong about the pass. It assumed a gate evaluable without issuing a request — the leak gate needed only a note and a context. Recall is not like that: what a leg returned "for query Q" is undefined unless a leg accepts a mechanizable Q, and none does. `catalog show --section` returns an entire section, so its recall is 100% by the coverage invariant and measures nothing; `graph query neighbors` needs a human-chosen seed; content matching is the agent's own tool, which contexture never invokes. `context gather` is the first leg in the system with a fully mechanizable input, so it is the first a gold-annotated fixture can address. **Alternative considered:** measure first, with fixtures over natural-language questions — rejected: that needs a mechanism turning a question into a leg invocation, which is the routing command this change drops, for the reason it drops it.

### D10 — Demotion is a path-prefix tier, separate from exclusion, and overlapping the two is an error
Archived material is the motivating case, and today it is either fully retrievable or invisible with nothing between: the shipped exclusion default covers only the tool's own directory, so an archived note ranks identically to a live one. This is GBrain's "archives demoted, not excluded" translated out of multiplier form into a tier. The two lists stay separate rather than one list with a mode, so reading the configuration answers "is this reachable at all" without inspecting a flag, and `doctor` fails a path declared both ways rather than resolving an ambiguity about reachability by precedence order. **Alternative considered:** a single list with a mode flag — rejected for that reason.

### D11 — The archive destination is demoted by default, and no migration retrofits it
The default is read from the configured archive destination, never a literal, so a store with a custom taxonomy demotes its own archive rather than someone else's. It ships as a default rather than a migration because its only observable effect is the ordering of a command no existing store has run. **Alternative considered:** a migration writing the prefix into every store's configuration — rejected: `retire-the-access-axes` D3's reasoning, do not rewrite what nothing reads.

### D12 — No retrieval output depends on the wall clock, stated as a requirement
GBrain anchors its recency decay to the newest candidate's timestamp rather than to the current time, for determinism. With no scores there is nothing here to decay, so the mechanism does not translate — but the principle does, and stating it as a requirement forecloses every future decay proposal mechanically instead of by re-argument each time. It also protects the byte-stability the derived artifacts already promise. **Alternative considered:** import the anchored-decay mechanism — rejected: it presumes a score to decay, and there is none.

### D13 — The template filename and fence id stay `retrieval-leg-routing`; only the prose changes
The fence is a marker in every existing store's entry document. Renaming it orphans that marker and buys a nicer slug, at the cost of a migration. **Alternative considered:** rename to match the pass framing — rejected on that trade alone.

### D14 — `retrieval-legs-hardening` is deleted and superseded, not reworked in place
Three of its four mechanisms change identity or die and its new capability's central requirement is unimplementable, so "editing" means rewriting every artifact under a name that no longer describes the result. Precedent: `retire-the-access-axes` D6 retired three pending changes by deletion and recorded their disposition in the successor. **Alternative considered:** rework in place and keep the directory name — rejected: it would leave a change called "legs hardening" that hardens no legs and adds one, and a reader would have to reconstruct which of its premises still stood.

**Disposition of its four mechanisms**, recorded here so the thread is not lost:
1. *`retrieval-quality` — the corpus, the recall-miss rate, the leak gate.* Re-cut and split. The leak gate's subject was deleted; exclusion-respect replaces it and lands here as an invariant. The corpus and the baseline move to `measure-the-no-ranker-bet`, sequenced after this change per D9. Its D3 — an improvement never auto-updates the baseline — survives verbatim.
2. *Aliases.* Deferred with its argument preserved: authored never inferred, collisions fatal under the existing identity-collision rule. It follows the baseline so its value is measured rather than asserted.
3. *A computable leg-routing command.* Cut. See the proposal's Non-goals; its "report the reason" idea survives as D4 here.
4. *Demotion, and catalog section tiers.* Demotion survives as D10 and D11. Section tiers are cut; see the proposal's Non-goals.

## Risks / Trade-offs

- **[Risk] The pass can only reach what the store has already linked or catalogued.** A note that nothing links to and whose section entry has no gloss is as invisible to the pass as it is to the catalog today, so this change could be mistaken for a recall fix it is not. → **Mitigation**: the `no_gloss` label makes the thin part visible at the point of use rather than in aggregate; `organize.orphan_notes` already reports the unlinked case; and this design states plainly that aliases, not composition, are the cure for a vocabulary miss.
- **[Risk] Making `graph query` fail on an over-inclusive graph turns a silent wrong answer into a hard stop**, and an operator who declares an exclusion mid-session will meet an error where they previously got results. → **Mitigation**: the error names the offending note and the one command that resolves it, and the failure is narrow by D7 — a merely out-of-date graph, which is the common case, still answers.
- **[Risk] Demoting the archive destination by default changes result ordering for stores that archive heavily**, and an operator who wants archived material ranked normally must now say so. → **Mitigation**: the effect is confined to a command no existing store has run, demoted notes are never dropped from any result or coverage check, and the declaration is one configuration line to remove.
- **[Trade-off] The pass duplicates, in a command, a narrowing an agent could perform by hand from two existing commands.** → Accepted: that is the point. The hand version is what the routing prose has asked for and no agent reliably does, and a composition performed the same way every time is what makes it measurable at all.
- **[Trade-off] This change carries five mechanisms** — the composition, the exclusion gate, the tier, the clock prohibition, and the prose rewrite. → Accepted because they are one thesis with one verification path: the pass is the leg, the gate is the guarantee that leg must not violate, the tier is the ordering the leg exposes, the clock prohibition is what keeps its output stable, and the prose is how an agent finds it. Splitting them would ship a leg with no guarantee, or a guarantee with nothing to guard.

## Migration Plan

Additive except in one place, and that place is the defect being fixed. Both configuration keys are schema-optional with shipped defaults, so no `schema_version` bump and no migration; the codebase's documented convention for additive keys applies. A store that never runs `ctxr context gather` sees byte-identical retrieval, with one exception: a `graph query` against a persisted graph carrying a note the store no longer admits now exits non-zero naming the note and `ctxr graph build`, where it previously answered from the stale graph.

Sequencing inside the change matters once: the exclusion admission check lands before the composition that reads through the same loader, per the project's rule that a filter over retrieval is sequenced before the legs it filters.

## Open Questions

None that change these specs. What the pass's default hop depth and note cap should be is a question the first baseline informs; both ship as configuration with defaults precisely so that answer is a configuration edit rather than a specification change.
