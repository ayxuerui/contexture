## Why

contexture ships three retrieval legs and is emphatic that the third one is not its own: content matching
"SHALL be performed by the agent directly against the store's files, **using its own tooling**." The store
declares its exclusions once so the agent can apply them "without invoking contexture," and the leg-routing
guidance tells the agent when to reach for that leg.

What the store cannot say is *which tooling*. `openspec/config.yaml`'s own context block answers this for
contexture's imagined store — "ripgrep content matching" — but a real store has no way to record that
answer where an agent will find it. So each store re-encodes it somewhere ad hoc: a convention document, a
skill, an operator's memory. An agent arriving at a store with a tuned index and a documented query protocol
has no supported place to learn it exists, and defaults to grep over a corpus someone already built better
retrieval for.

This is a gap in the *declaration*, not in the leg. The mechanism already exists one line away —
`retrieval.exclude_paths` is precisely "a fact about this store's content matching, recorded in
`contexture.yaml`, that contexture itself never acts on." The tool serving that leg is the same shape of
fact.

## What Changes

- Extend `context-retrieval`'s content-matching requirement: a store MAY declare, in `contexture.yaml`, the
  tool that serves its content-matching leg, and contexture SHALL NOT invoke, wrap, or require it. The
  declaration exists to be read by an agent, exactly as the exclusion list is.
- Name real tools in the scenarios — `ripgrep` for a store with no index, `qmd` (BM25-first, with a
  hybrid/vector path) for one that has built a tuned index. Consistent with a spec surface that already
  names `git`, `gh`, `node --check`, and `markdown-it` where naming the actual tool is the clearest way to
  say what is meant.

## Non-goals

- **Shipping, bundling, wrapping, or requiring any search tool.** No `ctxr search`, no adapter kind, no
  invocation. The requirement that contexture provide no content-matching command is untouched, and this
  change adds nothing contexture executes.
- **Reopening D2.** Ranked and semantic search stay deferred. This does not make contexture rank anything:
  a declared tool is a string in a config file that an agent reads. A store may name a tool that ranks;
  contexture still does not, and gains no ranker, score, or embedding of its own.
- **A search-adapter seam.** The deferred adapter seam is about contexture *calling* a ranked-retrieval
  backend through a contract it defines. This is the opposite direction — contexture recording that
  something else exists and stepping back.
- **Validating that the declared tool is installed, or making `doctor` check for it.** `doctor` stays
  offline and stays out of the business of the agent's own toolchain; a declaration that names an absent
  tool is the agent's problem to notice, not an invariant violation.
- **Prescribing a query protocol.** How to phrase a query, when to prefer the tool over grep, when to
  re-index — that is store-specific operating knowledge and belongs in a store's own conventions, not in a
  requirement written for an unknown audience.

## Capabilities

### Modified Capabilities

- `context-retrieval`: the content-matching requirement gains an optional, never-invoked declaration of the
  tool that serves the leg.

## Impact

Affected code: a new optional `contexture.yaml` key under `retrieval` (`src/config/schema.ts`,
`src/config/defaults.ts`), schema-optional with no default so a config predating it still parses — the
`publish.path` precedent, not the required-field pattern that forced a migration for
`harness.skills_path`. Read by nothing in `src/` at runtime, which is the point; `templates/agents/retrieval-leg-routing.md`
should surface it in the generated routing section so an agent sees it where it already looks.

Affected stores: additive and optional. A store that declares nothing behaves exactly as today, and no
migration or schema version bump is needed.
