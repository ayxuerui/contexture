## Why

The note templates shipped with a compass — `Upstream`, `Downstream`, `Similar`, `Opposing` — written into
the idea template as fixed content. Two things about that are unfinished.

**The compass does not do anything.** Typing an edge is driven by `retrieval.relations`, which defaults to
empty, so on a store that has not hand-written that key the four headings are prose: the links under them
are recorded, but untyped, and `ctxr graph query neighbors --type` has nothing to filter. A shipped
template that promises structure the shipped configuration ignores is worse than no template, because it
teaches an agent a shape that produces nothing.

The key itself is the problem. It was configuration for a decision no store should have to make: the
vocabulary is not about what a store contains, it is about what one note can be to another, and a store
inventing its own names gains nothing while losing the ability for a shipped skill to say anything
concrete about them. Every consumer already carries a dead branch for the empty case — the entry document
says "every link is untyped", the connection-proposal skill collapses to a single **Related** group — and
those branches exist only because the vocabulary was allowed to be absent.

**The idea template lost its source section.** `Concept` shipped without one, on the reasoning that
`ctxr ingest` already records provenance in a note's `sources:` frontmatter. That reasoning conflated two
different things. The frontmatter is a machine-written list of capture paths; a reader wanting to know
where an idea came from, in prose, with the part that mattered quoted, has nowhere to put it. 87 notes in
the origin store carry the heading, which is what a store does when a template omits something it needs.

## What Changes

- **The relation vocabulary becomes fixed.** `retrieval.relations` is removed from configuration; the four
  names and their definitions are a constant every consumer reads. **BREAKING** for a store that declares
  the key: it becomes an unrecognized key and fails `ctxr doctor` by name until removed.
- **Typed edges work with no configuration at all.** A link under a compass heading is typed on the next
  `ctxr graph build`, in every store, which is what the shipped template already implies.
- **Every empty-vocabulary branch is deleted** — the entry document's "every link is untyped" line, the
  connection-proposal skill's single-group fallback, and the graph's empty-vocabulary default. A branch
  that can no longer be reached is not a fallback, it is dead code that documents a state the system no
  longer has.
- **Each name carries its definition wherever it is named** — the entry document, the connection-proposal
  skill, and the template itself — read from the one constant, so a definition cannot drift from its name.
- **The directedness is stated with them**: an edge is recorded only on the note carrying the link, so
  naming a note Upstream does not write the reciprocal Downstream edge on it.
- **`Concept.md` regains `## Source`**, distinguished from the `sources:` frontmatter in the comment under
  it, so the two channels are not confused for one another.

## Capabilities

### Modified Capabilities

- `context-retrieval`: MODIFIED — the relation vocabulary is fixed, enumerated with definitions, and no
  longer read from configuration; edges remain directed with no automatic reciprocal.
- `harness-portability`: MODIFIED — the owned-skills requirement drops the empty-vocabulary fallback and
  requires each name to be rendered with its definition.
- `store-integrity`: MODIFIED — the unrecognized-key check covers a retired key nested inside a block,
  detected against the configuration file's text, since the schema strips one before the check can see it.

## Non-goals

- **Making the vocabulary extensible.** A store that wants `depends-on` writes it as an ordinary heading
  and gets an untyped link, which is what it got before this change and what every non-compass heading
  gets. Re-admitting configuration to serve that case would restore the empty branches this change exists
  to delete. If a real store produces a real second vocabulary, that is a change with evidence behind it.
- **Defining what a relation means beyond one sentence.** The definitions exist so an agent can choose
  between neighbours, not to specify a semantics. Nothing validates that a link deserves its type.
- **Recording the reciprocal edge automatically.** The graph enumerates structure and infers nothing; the
  inverse of a relation is often true but not always, and inventing an edge the author did not write would
  break that contract.
- **A `schema_version` bump.** Removing a key does not change the shape of a config that never declared it,
  and a bump would refuse every existing store outright — the machinery that used to carry one forward has
  been retired.

## Impact

**BREAKING, for exactly one class of store** — one that declares `retrieval.relations`. `doctor` fails
naming `retrieval.relations` and saying what replaced it, until those lines are deleted. This needed the
unrecognized-key check extended: zod strips an unknown key inside a block, so without that the store would
have kept the key, kept believing it meant something, and passed. The store loses nothing:
the names it declared are the names now shipped. `~/workspace/pkm` is such a store and is migrated as its
own change.

**Behaviour change for every other store** — links under a compass heading become typed. Nothing consumes
edge type in a way that can break: orphan detection counts any edge, hub and bridge ranking count distinct
clusters. The observable effect is that `--type` starts returning results.

**Deleted** — a schema field, a shipped default, and three empty-vocabulary branches with their tests.

**Touched** — the graph's link extraction, the entry document's conventions renderer, the
connection-proposal skill renderer, and `templates/notes/Concept.md`.
