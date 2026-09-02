## Context

See `proposal.md` — Why. Surfaced while retiring a mature store's local spec set: one of its requirements —
"content and semantic search run through `qmd`, not the graph" — had no contexture equivalent, while its
other four requirements mapped onto `context-retrieval` almost exactly. That store documents its query
protocol thoroughly in its own conventions; what it could not do was record the tool where contexture's
generated leg-routing guidance would mention it.

## Goals / Non-Goals

**Goals:**
- Give a store one supported place to record which tool serves its content-matching leg.
- Keep contexture's distance from that tool total: no invocation, no validation, no dependency.
- Say it in language a spec for an unknown audience can carry, while still being concrete enough to be useful.

**Non-Goals:** see `proposal.md` — Non-goals (no shipped or wrapped search, D2 stays deferred, no adapter
seam, no `doctor` check, no query protocol).

## Decisions

**D1 — Naming real tools in the scenarios is consistent with this spec surface, and clearer than not.**
The authoring rule this brushes against forbids encoding *one deployment's* taxonomy, org chart, or context
names — "an OSS spec for an unknown audience, not a record of any one deployment." A general-purpose
command-line search tool is not that: it is the same category as `git`, `gh`, `node --check`, and
`markdown-it`, all named in requirements or shipped skills, and as `ripgrep` in `openspec/config.yaml`'s own
description of this very leg. The test that matters is whether a reader at an unrelated store is misled, and
"`ripgrep` for a store with no index, `qmd` for one with a tuned index" reads as two illustrations of a
choice, not as a requirement to install either. Alternative considered: a purely abstract requirement naming
no tool. Rejected — it would describe a config key whose entire purpose is to hold a tool name while
refusing to show one, which makes the requirement harder to understand for no gain in portability.

**D2 — A declaration, not an integration.** The key holds a name and, optionally, how to invoke it; nothing
in `src/` reads it to do work. This is what keeps D2-the-deferral intact: contexture is not acquiring a
ranked-retrieval backend, it is writing down that the agent has one. The precedent is `retrieval.exclude_paths`,
which contexture *does* consume, but whose stated purpose is equally to be read by an agent "without
invoking contexture." If a later change wants contexture to actually call a retrieval backend, that is the
deferred adapter seam and needs its own argument; this deliberately does not build toward it.

**D3 — Schema-optional with no default.** `publish.path`'s pattern: `readConfig` does a strict parse with no
default-merging, so a required key breaks every store that predates it. Optional-with-no-default means a
store that declares nothing is unchanged and no migration or schema bump is needed. There is deliberately no
shipped default — defaulting to `ripgrep` would assert something about a store contexture has not looked at.

**D4 — Surface it where the agent already reads.** `templates/agents/retrieval-leg-routing.md` is the
generated section telling an agent which leg answers which question, and it currently ends the content-matching
branch at "use your own tooling." That is exactly where a declared tool should appear; putting it only in
`contexture.yaml` would mean the agent has to already suspect it exists.

## Risks / Trade-offs

- **A named tool in a spec ages differently than an abstraction.** If `qmd` is abandoned, the scenario reads
  as a recommendation for dead software. → Mitigated by the scenarios framing both tools as illustrations
  of a store's choice rather than endorsements, and by the requirement itself naming neither. This is the
  same exposure `ripgrep` already carries in `openspec/config.yaml`.
- **A declared tool could be read as a promise contexture keeps.** An agent might assume a declared tool is
  installed, or that contexture verified it. → The requirement states contexture never invokes or validates
  it, and the non-goals rule out a `doctor` check explicitly, so the absence is specified rather than
  incidental.
- **It nudges toward the deferred seam.** Having recorded the tool, wiring contexture to call it is a small
  step. → Named as a non-goal, with the distinction stated: recording that something exists is not a
  contract for calling it. The next person proposing the call still has to argue D2.

## Migration Plan

Additive and optional. No schema version bump, no migration, no change to any command's behavior. A store
declares the key or does not; `ctxr update` regenerates the leg-routing section either way.
