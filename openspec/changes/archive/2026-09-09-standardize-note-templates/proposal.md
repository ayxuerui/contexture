## Why

Contexture ships every other piece of store-resident prose — the owned skills, the six generated
`AGENTS.md` sections, the baseline conventions, the git hooks — as markdown under `templates/`, rendered
against each store's own configuration. The shape of a *note* is the one thing it ships nothing for.
What it ships instead is an instruction to imitate: `ctxr-placement` says "read one or two sibling notes
in the chosen location and match their shape," and `ctxr-session-capture`'s proposal body is "matching the
frontmatter and style of the sibling notes."

Imitation has no fixed point. Every store therefore invents and hand-maintains its own scaffolds, and they
drift from the notes they are supposed to describe. In the origin store (`~/workspace/pkm`: nine
hand-maintained template files, and 322 markdown notes across its three active taxonomy layers) the drift
is measurable:

| Observed | Count |
|---|---|
| `type:` — declared by three of its templates | present in **3 of 322** notes |
| `## Professional Background` — the person template's lead section | **0** notes; real person notes use `## Bio` (27) |
| `## Related` vs `## Connected Notes` | 27 vs 14 — two spellings of one section |
| `## Next steps` vs `## Next Steps` | 14 vs 3; and `## Current State` (6) against the shape `ctxr rollup write` actually writes, `## Current state` |
| `tags:` across the template files | three spellings — a YAML sequence, a bare scalar, and one (`tags: Project, StatusNew`) that is a single string rather than two tags. Every note that carries the key uses the sequence form, so two of the three spellings are template-only |
| `{{date}}` / `{{title}}` | orphaned placeholders — that store retired the editor that expanded them, and nothing substitutes them now |

That store's own house conventions carry the maintenance burden as a standing rule — "keep `templates/` in
sync with the conventions here" — which is exactly the kind of hand-held invariant contexture exists to
replace with a mechanism.

The sharpest evidence is not in the table. That store's four most-used section headings — `## Upstream` (99),
`## Similar` (98), `## Downstream` (93), `## Opposing` (83) — are precisely its configured
`retrieval.relations`, which contexture's graph already reads as typed edges. The most-used structure in
the store is a contexture mechanism, and the templates that produce it are hardcoded copies that know
nothing about the configuration driving it. One config edit silently desynchronizes them.

## What Changes

- **A note template is a first-class store artifact.** A new `templates.path` configuration key, shipped
  default `.contexture/templates/`, names where a store's note templates live. Templates are never notes:
  the path joins the skills and guidance paths in the note-enumeration exclusion, so nothing under it is
  catalogued, graphed, linted as an orphan, or returned by retrieval.
- **contexture packages a library; the store declares what it installs.** `templates.installed` lists the
  templates a store wants, defaulting to the shipped list, with an empty list meaning "install none" —
  the same contract `skills.vendored` already carries for vendored skills. The library is contexture's
  offer, not its assertion about what a store is about: a store drops what it does not need and adds its
  own kinds as files the list never names.
- **The library covers the shapes a knowledge store actually accumulates** — a base, a synthesized idea,
  work with a stated end state, and the recurring entities (a person, an organization, and the deal-shaped
  record an organization-facing store keeps).
- **A template is fixed content.** Every packaged file is byte-identical across stores — no configuration
  value appears inside one. The idea template carries the four relation sections literally, with a
  definition under each saying what belongs there, because a heading an agent cannot interpret is not
  guidance.
- **Refreshed by `ctxr update`, like the skills.** An installed template is re-rendered when the
  configuration or the packaged version changes. A store's own kinds sit alongside, never touched.
- **A locally modified installed template is preserved and reported, never overwritten** — the contract
  `harness-portability` already states for a vendored skill, carried by the same kind of record, because a
  template's bytes are copied into notes and so cannot carry an in-file ownership marker.
- **A fixed placeholder vocabulary**, `{{title}}` and `{{date}}`, substituted by the agent and by no
  command. Named in exactly one place so a check can find a note that landed with one unsubstituted.
- **The shipped skills stop telling agents to imitate.** `ctxr-placement`, `ctxr-ingest-orchestration` and
  `ctxr-session-capture` gain the create-versus-extend split: a new note starts from a template; an
  existing note is extended in place, never overwritten. Which template fits stays the agent's judgment,
  informed by a directory's own `README.md` where it states one.

No breaking change. Both configuration keys are additive and resolve to shipped defaults in a store that
never names them, so they reach an existing store through `ctxr update` with nothing for it to run.

## Capabilities

### New Capabilities

None. Every requirement this adds belongs to a capability that already exists, and a new spec directory
for "the shape a note starts from" would split ownership of the note concept away from `context-store` —
a spec directory name being the most expensive thing in this project to get wrong.

### Modified Capabilities

- `context-store`: ADDED — a note template is a starting shape and never a note, excluded from note
  enumeration and sanctioned by the write-path gate; and the placeholder vocabulary a template may carry,
  enumerated here and nowhere else. MODIFIED — the tool-owned home directory gains the note-template
  subdirectory, with the retrieval exclusion the catalog, skill pack and published pages already get.
- `harness-portability`: ADDED — `templates.path`, `templates.installed` and the packaged library;
  templates as fixed content, byte-identical across stores; installation by `init` and refresh by
  `ctxr update`; the record that identifies a contexture-delivered template; a locally modified template
  preserved and reported rather than overwritten; and the shipped skills distinguishing a new note from an
  existing one, with template choice left to judgment rather than bound to a layer.

`store-lifecycle` is deliberately not touched. Delivery-by-`init` for shipped prose already lives in
`harness-portability` — that is where the baseline convention, the owned skills and the vendored skills
each state it — and `store-lifecycle`'s init requirements are about the taxonomy and the capture tier.
Adding a second owner of "init installs the templates" would put one behavior in two specs.

## Non-goals

- **A `ctxr note new` command.** The CLI deliberately does not create notes — `ingest` requires `--into`
  precisely because deciding what the store should know is the work, not a side effect of filing. Making
  the CLI expand a template would move an editorial decision across the code/judgment seam to buy a
  string substitution an agent already performs. Substitution stays the agent's job, stated in a skill.
- **Binding a template to a taxonomy layer.** A configuration key mapping a layer to its default template
  was considered and rejected: a layer is a placement axis and holds notes of many kinds — a store's
  people, its organizations and that area's own hub notes commonly share one layer — so a single per-layer
  default would be wrong for most of what the layer contains. It would also read as enforcement while
  being none, since nothing compels an agent to use the bound template. A directory that genuinely has one
  answer states it in its own `README.md`, which the baseline conventions already direct an agent to read
  before working there — the right granularity, and a mechanism that already ships.
- **Frontmatter validation.** `context-store`'s note-frontmatter requirement holds: frontmatter stays
  optional and a note without it stays valid. A template is a starting point, not a schema, and this
  change adds no check that a note conforms to one — that would be the `fields:` block schema 8 removed,
  arriving again under a new name.
- **Migrating the stores on this machine.** `~/workspace/pkm` and `~/workspace/readyrun-context` each run
  relocate their own template files, and reconcile with the packaged set, in their own repositories as
  their own changes, gated on the npm release rather than on this merge.
- **A per-note template record.** Nothing records which template a note was cut from. A note that outgrows
  its starting shape is doing the right thing; a stored pointer back to a template would make that
  divergence look like drift and invite a check that punishes it.

## Impact

**Configuration** — a new `templates` block (`path`, `installed`) with shipped defaults, alongside the
existing `catalog` and `publish` blocks it is shaped after. Additive with defaults, so no schema-version
bump: an omitted key resolves to the shipped default, which is the propagation mechanism `context-store`
already specifies — and with migrations retired and an older recorded version now refused outright, a bump
would lock existing stores out rather than carry them forward.

**New code** — `templates/notes/*.md` (the shipped set) and one renderer/sync module beside
`core/convention-doc.ts` and `core/skills.ts`, reusing the existing `packagedTemplate` /
`substituteBlock` loader and the vendored-skill manifest pattern.

**Touched code** — `core/notes/list.ts` (`excludedPrefixesFor`, so a template is never enumerated as a
note), `core/write-lifecycle/path-gate.ts` (`contextureOwnedPrefixes`, so a store running the strict
`writable_paths` allowlist can still edit its own templates), `commands/init.ts` (install), and
`core/reconcile.ts` (refresh on update, and therefore also on a re-run of `init`). No change to
`taxonomy/profiles.ts` or to `TaxonomyLayerSchema` — see the layer-binding non-goal.

**Shipped prose** — the three skills named above, and the `AGENTS.md` canonical section, which names
where templates live so an agent finds them without reading the CLI.

**Downstream** — an existing store gains the directory on its next `ctxr update` after the release. Its
own template files keep working wherever they are; relocating them is that store's own change.
