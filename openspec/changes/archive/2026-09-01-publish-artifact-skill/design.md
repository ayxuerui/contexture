## Context

See `proposal.md` — Why. This is a cross-cutting change (new command group, new config field, new
skill, new derived location plumbed into an existing exclusion list) small enough on its own but worth
a design pass because of the naming and boundary decisions it locks in.

Two existing mechanisms this builds directly on:
- `src/commands/rollup-gather.ts` — the "agent-facing enumeration only" shape: a command that resolves
  a name to a note set and reports it, doing no synthesis and no writing itself. `publish gather`
  follows the same shape for its entity selector, and generalizes it to three more selector kinds.
- `src/commands/check.ts` — the existing single-note tri-state evaluation
  (`evaluateDisclosure` / `scanNoteForLeaks`, `VERDICT_EXIT_CODE`). `publish gather` calls this once per
  note in its resolved set; nothing about single-note `ctxr check` changes.

The originating research was a production convention (`knowledge-artifact-pages`, observed in an
external vault, read in full) that already solved page identity, provenance, and style inheritance
well, but defended confidential material with a documented convention and a cosmetic badge rather than
a mechanism. That gap — and only that gap — is what this design adds a real command around.

## Goals / Non-Goals

**Goals:**
- Make the disclosure gate a mechanism a page-building agent cannot skip by forgetting to loop over
  notes by hand: one command, one aggregate verdict, one exit code contract.
- Generalize "subject" beyond a folder, since a real subject (an audience-scoped subset of a store, a
  concept whose sources aren't co-located, a single page) doesn't always correspond to a directory.
- Keep contexture's existing boundary between computed/verified CLI behavior and agent judgment intact:
  gather computes and gates; new scaffolds and validates identity; check verifies structure. None of
  the three choose a page's form or write its content.

**Non-Goals:** see `proposal.md` — Non-goals (no shipped renderer, no vendored third-party skill, no
server, no generated gallery, no export formats). Additionally, at the design level: no attempt to
model "kind" (living vs. snapshot) as a config field or frontmatter value — like the convention this
generalizes from, kind is encoded once, in whether the folder name matches the reserved date-prefix
pattern, and nowhere else, to avoid the dual-source-of-truth failure mode the source convention
documented and fixed.

## Decisions

**Four selectors on one command, not four commands.** `--under` / `--note` / `--entity` / `--as` are
mutually exclusive flags on `publish gather` rather than `publish gather-folder`, `publish
gather-entity`, etc. Alternative considered: separate subcommands per selector, mirroring `rollup
gather <entity>`'s positional-argument style. Rejected because the output contract (per-note verdicts,
worst-verdict exit code) is identical across all four, and a shared flag-based front end keeps that
contract in one place instead of four. `rollup gather` stays positional because it only ever has one
selector; `publish gather` has four, so a flag makes the selector kind self-documenting in scripts and
skill prose alike.

**Aggregation ordering lives in `disclosure-policy`, not `publish`.** The most-restrictive-member
ordering (DENY > ASK > ALLOW) is defined once as a new disclosure-policy requirement, and `publish`'s
own spec references it rather than restating it. This follows the project's existing single-sourcing
discipline (the visibility field's key name, shipped taxonomy profiles — each asserted in exactly one
place) and leaves the door open for a second future batch-evaluation consumer to reuse the same
definition without a second copy to drift.

**No new exit code.** `publish gather`'s aggregate verdict maps onto the three exit codes
`disclosure-policy` already reserves (`ExitCode.Ok` / `DisclosureAsk` / `DisclosureDeny`). Alternative
considered: a distinct "partial" code when the set is mixed. Rejected — `cli-contract`'s taxonomy is
described as allocated once and not extended by guessing a number under pressure in a later phase; a
mixed set is still, for the purpose of "can this be published," exactly as blocked as an all-DENY set,
so a fourth code would encode a distinction with no different caller action attached to it.

**A new `publish.path` config field and default, not reuse of `derived.paths` or `catalog.path`.**
A published page is authored (often extensively, by hand or by an agent following the skill), so it
does not belong under the derived/cache path, which is declared-gitignored-and-regenerable by
definition. It is not the catalog either — a catalog entry is a structural gloss over a note, a
published page is a standalone artifact with its own folder, README, and assets. It gets its own
config key, matching the shape `catalog: { path }` and `harness: { conventions_path, skills_path }`
already use, defaulting to `.contexture/publish/` per the placement reasoning in `context-store`'s
modified requirement (authored-but-tool-owned content excluded from retrieval, not raw store content
like `inbox/`/`archive/`, and not forced to a harness-specific root the way skills are).

**`publish.path` is schema-optional with a default, not a required field written only by `init`.**
`readConfig` (`src/config/load.ts:23`) does a strict `StoreConfigSchema.safeParse` with no
default-merging — every other tool-owned path field (`catalog.path`, `harness.skills_path`, …) is
`z.string().min(1)` with no zod-level default, populated only by `init` writing it explicitly, which
is why past additions to that set (e.g. `rename-procedures-path.ts`) needed a real migration: a config
missing the key fails to parse at all. Following that same required-field pattern here would break
`readConfig` for every store that predates this change. Instead `publish.path` is declared
`z.string().min(1).default(DEFAULT_PUBLISH_PATH)`: `init` still writes it explicitly for a fresh store
(consistent with how every other path field reads in a freshly generated `contexture.yaml`), but a
store whose `contexture.yaml` predates this change and has no `publish:` key still parses successfully,
taking the default at read time. This is what makes the "additive, no migration" claim in Impact
actually true rather than asserted.

**Naming: `publish`, not `artifact` or `artifacts`.** `ctxr-derived-artifacts` already names a
different, specific concept — mechanically regenerated build products (catalog sections, the graph,
generated document sections, adapter outputs). Reusing "artifact" for hand-authored external-facing
pages would make the same word mean two different things across two skills an agent reads back to
back. `publish` names the concept actually at stake — content leaving the store for an audience — and
is used identically everywhere: the skill slug (`ctxr-publish`), the command group (`ctxr publish ...`),
the config key (`publish.path`), and the on-disk folder.

**The craft layer (HTML/CSS/JS authored content) is delegated, never shipped.** Four open-source
HTML-artifact skills were surveyed (`anthropics/skills/web-artifacts-builder`, `dogum/html-artifacts`,
`jiji262/claude-design-skill`, `ConardLi/garden-skills/beautiful-article`). None encode contexture's
disclosure model — audience, visibility, hard walls are absent from all four — so none can replace the
gate this change adds regardless of which is chosen. Vendoring one into contexture's shipped skill set
was considered and rejected: contexture's skill-packaging mechanism
(`syncShippedSkills`/`src/core/skills.ts`) writes and byte-diffs exactly one file per skill
(`<slug>/SKILL.md`); the strongest candidate's value is in progressively-loaded `references/*.md`
files, which either has to be flattened (losing the point of progressive loading) or requires
extending contexture's packaging to multi-file skills — a real, separable change this proposal does
not make. A tested sample also failed contexture's own shipped-skill content guards on ordinary
English (a case-insensitive tier-word check false-positives on "shared"/"team" used as plain prose),
meaning even an automated re-vendoring process would need per-pull manual edits, defeating the point of
vendoring for freshness. `ctxr-publish` instead names the decision (gate, identity, provenance) and
defers the visual craft to whatever design-focused skill is installed in the store as an
operator-authored skill (untouched by contexture's sync) — the same delegation the source convention
itself already used toward its own craft skills.

**Structural checks are derivable from the file, never require the caller to supply an assertion.**
The source convention's structural checker had two modes: tag-balance (derivable from the file alone)
and `--expect NEEDLE=COUNT` (the caller must remember to supply the right assertion every time). The
second mode is dropped from `publish check`'s design; its own sibling tooling in the source vault
documented that it false-fails against JavaScript-rendered content, and requiring the caller to
remember an assertion on every invocation is exactly the "bookkeeping the editor must remember" pattern
that vault's own retrospective flagged as reliably rotting. `publish check`'s checks are instead all
answerable from the file and its sibling README alone.

## Risks / Trade-offs

- **A four-selector command is more surface than four small ones.** → Mitigated by giving each selector
  its own scenario in the spec and its own unit test; the shared output contract (verdicts + aggregate
  exit code) means the added surface is in argument parsing, not in four divergent behaviors to
  maintain.
- **Delegating craft to an operator-installed skill means a fresh store has no visual output at all
  until one is installed.** → Accepted deliberately; a shipped default look was the thing the source
  convention itself warned against ("no generic markdown→HTML render that best represents the
  knowledge"). The skill names this explicitly rather than silently producing an undifferentiated page.
- **A new config field is one more thing a store must carry.** → Mitigated by giving it a sensible
  default consistent with every other tool-owned path, so a store that never runs `ctxr publish` is
  unaffected beyond one unused default and one more shipped skill file.
- **The four-selector output could grow inconsistent if a fifth selector is added later without
  revisiting the shared contract.** → Mitigated by the spec asserting the per-note-verdict and
  aggregate-exit-code requirements independently of the selector requirement, so a new selector only
  needs to satisfy "resolves to a note set" to inherit the rest for free.

## Migration Plan

Additive; no existing command or skill changes behavior. `ctxr update` on an existing store adds the
`ctxr-publish` skill file, the same mechanism that has delivered every skill added since
`owned-skills-expansion`. The new `publish.path` config field needs no migration to be read (see the
schema-optional-with-default decision above) — a pre-existing `contexture.yaml` with no `publish:` key
parses successfully and resolves to the default path. No data migration, no schema version bump.
