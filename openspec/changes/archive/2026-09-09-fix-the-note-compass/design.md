## Context

See proposal.md — *Why*. What shapes the approach:

- **Nothing consumes edge type in a way that can break.** Orphan detection counts any edge; hub and bridge
  ranking count distinct clusters. Turning typing on changes what `--type` returns and nothing else.
- **`doctor` fails a store by name on an unrecognized TOP-LEVEL config key** — but a key nested inside a
  block is stripped by the schema before any check sees it, so removing a nested key is silent unless
  something is added to notice (D5).
- **Removing a key needs no `schema_version` bump.** A config that never declared it is unchanged; a bump
  would refuse every store outright, and the machinery that used to carry one forward has been retired.
- **Three consumers already branch on the vocabulary being empty**, and each branch documents a state that
  is about to become unreachable.

## Goals / Non-Goals

**Goals:**

- The compass in the shipped template produces typed edges, in every store, with nothing declared.
- One source for the names and their definitions; every artifact that mentions a relation reads it.
- Fewer states, not more: the empty-vocabulary case stops existing rather than being handled.

**Non-Goals:**

- No extensibility mechanism, no per-store vocabulary, no reciprocal-edge inference.

## Decisions

### D1 — Delete the key rather than default it

The alternative was to keep `retrieval.relations` and change its default to the four names — non-breaking,
and a store keeps the option of its own vocabulary.

Rejected, because the option is the problem. A store that declares `depends-on` gets a name no shipped
skill can say anything about, no shipped template offers a section for, and no definition explains — the
vocabulary would be configurable in name while everything built on it assumed the shipped four. Worse, the
empty case stays reachable, so every consumer keeps a branch for a state the shipped template contradicts.

Deleting the key removes a decision no store benefits from making, and takes three dead branches with it.
The cost is one class of breakage — a store that declares the key — which `doctor` reports by name, and
whose fix is deleting the lines it no longer needs.

### D2 — The definitions live with the names, and every artifact reads both

A name without a definition is not usable by the agent that has to choose between `Similar` and `Upstream`,
which is the only question the vocabulary actually raises. Each definition therefore states when to use the
relation and how it differs from its nearest neighbour, and the pair is exported once and read by the graph,
the entry document, the connection-proposal skill, and the template — so no artifact can drift from it.

The template is the exception that proves it: its sections are fixed markdown, so its definitions are
written in the file rather than rendered. A test pins them against the constant, which is the cheap way to
keep a fixed file honest without making it a rendered artifact again.

### D3 — Say edges are directed, next to the definitions

Nothing writes the reciprocal edge. An agent that assumes `Upstream` on A implies `Downstream` on B writes
half the graph and has no way to notice. One sentence, wherever the vocabulary is explained.

*Alternative considered:* record the reciprocal at build time. Rejected — the graph enumerates structure and
infers nothing, and the inverse of a relation is often true but not always.

### D4 — `## Source` returns, and says what it is not

The section was dropped on the reasoning that `ctxr ingest` already records provenance. That conflated a
machine-written list of capture paths with a reader-facing account of where an idea came from and what part
of it mattered. Both belong; they are different artifacts with different authors.

The comment under the heading says so explicitly, because the failure mode is an agent duplicating the
`sources:` list into the body, or skipping the prose because it sees the frontmatter and thinks the job is
done.

### D5 — A retired nested key has to be caught against the file

Removing `retrieval.relations` was supposed to be a loud break. It was not: zod strips an unknown key
inside a block, so the store parsed fine, `doctor` passed, and the key sat in the config meaning nothing.
That is the worst of both — the store keeps a line it believes is load-bearing, and nothing contradicts it.

So the unrecognized-key check gains a small companion: a list of retired dotted paths, checked against the
configuration file's own text rather than the loaded config, reporting what replaced each one. One entry
today. The alternative was making the retrieval block strict, which would turn every unknown key under it
into a hard parse failure — a much wider blast radius than this change is entitled to.

## Risks / Trade-offs

- **A store declaring the key breaks on upgrade.** → By design and by name: `doctor` reports the unrecognized
  key and the fix is deleting it. The only such store is the origin store, whose declared names are exactly
  the ones now shipped, so it loses nothing. Migrated as its own change.
- **A store wanting a different vocabulary has no route.** → It writes the heading it wants and gets an
  untyped link, which is what it had before. Stated as a non-goal rather than left to be discovered.
- **Fixed definitions are an opinion shipped to every store.** → They are prose in regenerated artifacts,
  not a validated rule; nothing checks a link against its definition, and a store that disagrees says so in
  its own conventions, which are inlined after the baseline and win where the two speak to the same thing.
- **The template's definitions are a copy of the constant.** → A test asserts they match, so the copy cannot
  rot silently. This is the price of the template being fixed content, which is a decision the previous
  change already made deliberately.

## Migration Plan

No `schema_version` bump and nothing to run. A store that never declared `retrieval.relations` upgrades
silently and gains typed edges on its next `ctxr graph build`. A store that declared it fails `doctor` with
the key named, and deletes those lines.
