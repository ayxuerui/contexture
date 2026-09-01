## Why

The publish skill ships with a delegation that nothing satisfies. It states that contexture ships no
renderer and no visual system on purpose, and directs the agent to load whichever design-focused
skill the store has configured or installed — but a freshly initialized store has none, so the
delegation dangles and the agent invents a visual language per page, which is the exact failure the
skill was written to prevent. Closing that gap by telling operators to install one by hand has not
worked as a plan: it leaves the shipped skill depending on a step contexture never performs and
cannot verify.

Meanwhile the surrounding ecosystem settled the two hard parts. Agent Skills is now a published
cross-runtime format — a skill is a directory containing `SKILL.md` with `name`/`description`
frontmatter, plus optional `scripts/`, `references/`, and `assets/` — so a skill's *content* is
already harness-neutral, and only its destination directory differs per harness. That makes
"install a craft skill, correctly, for whichever harness this store is driven from" a small,
well-defined job contexture can do at `init` and `update` instead of deferring.

## What Changes

- Contexture **vendors** one permissively-licensed third-party craft skill into the published package
  and writes it into a store at `init`, refreshing it at `update` — the same delivery path its own
  owned skills already use. The vendored copy is byte-identical to its upstream.
- Vendored skills are identified by a **provenance record written beside the skill**, not by
  contexture's managed-owner header — that header cannot be injected into a third-party licensed file
  without modifying it and displacing the frontmatter block the format requires at the top.
- The provenance record carries a content hash, which makes three behaviors mechanical: refresh on
  version change, a byte-stable no-op when nothing changed, and **detecting an operator's local edit
  so it is reported and preserved rather than clobbered**.
- Skills are written **once**, into the ecosystem's canonical cross-harness location, which the
  majority of agent runtimes read natively with no per-harness step at all.
- For a harness that reads its own branded directory instead, contexture **bridges that directory to
  the canonical one with a symlink**, created at setup for each harness the operator declares. Where
  the platform or filesystem cannot create one, contexture **falls back to copying** and reports which
  mode it used, so the store is correct on every platform rather than correct only on POSIX.
- Which harnesses a store targets is **declared by the operator at setup** — a flag for
  non-interactive runs and a prompt otherwise — never discovered by probing the machine.
- Harness-generation adapters gain a **declared skills directory**, which is what the bridge points
  at. The interface moves to version 2: it declares that directory, and generating a harness entry
  file becomes optional, so a harness that reads the canonical entry document natively can be
  expressed as a skills-only adapter.
- A new configuration block lists which vendored skills a store wants, defaulting to the shipped set
  and accepting an empty list to opt out entirely.

## Capabilities

### New Capabilities

<!-- None. This change extends three existing capabilities; it introduces no new concept that needs
     its own spec directory. -->

### Modified Capabilities

- `harness-portability`: contexture ships vendored third-party skills alongside its owned ones,
  delivered by init and refreshed by update, identified by a provenance record, preserved once
  locally modified, written to every configured harness target, and listed by a configuration block
  with a shipped default and an opt-out.
- `adapters`: the harness-generation interface at version 2 declares a skills directory and makes
  entry-file generation optional; a declared adapter still on version 1 is refused by the existing
  version-mismatch rule.

<!-- The vendored-skills configuration block lives in harness-portability rather than context-store:
     it governs which skills reach which harness, not the store's shape or its config-as-single-
     source-of-truth contract, and context-store's existing requirements are unchanged by it. -->

## Non-goals

- **Fetching anything over the network at init, update, or any other CLI runtime path.** Contexture
  makes no network calls today outside the forge adapter shelling to its host CLI, and that property
  is worth more than freshness here: a store must initialize identically offline, in CI, and years
  from now. Re-vendoring is a maintainer-run script, not a runtime step, so the cost is that a
  vendored skill is only as current as the release that carries it.
- **Delegating installation to the ecosystem's own installer.** It is the obvious candidate and it
  already knows both harness layouts, but it installs only into each harness's fixed directory and
  offers no way to target a store's configured skills path, so it cannot honor a store that has
  relocated its own. It would also reintroduce the network dependency ruled out above.
- **Vendoring more than one craft skill now.** The seam this change builds is plural — the
  configuration is a list — but shipping a second upstream doubles the attribution surface and the
  staleness contexture owns, for a marginal gain over the one chosen. Adding one later is a
  configuration and payload change, not a redesign.
- **Installing into a harness's global, user-level skills directory.** Contexture writes inside the
  store; a user-level install is the operator's own environment, outside a store's contract and not
  something a store's configuration should silently reach into.
- **Detecting which harness is installed.** Unknown deployments vary, and a probe would make
  `init` non-deterministic across machines for the same store. Harness targets are declared in
  configuration, resolved the same way every other location in the store is.
- **Guaranteeing a committed symlink survives every future clone.** A bridge symlink is created and
  repaired on the machine running contexture, and a checkout that cannot represent one is detected
  and repaired into a copy. What contexture cannot do is stop a clone on a symlink-hostile checkout
  from materializing the link as a text file in the first place; it can only notice and fix it.
- **Modifying vendored content to satisfy contexture's own authoring guards.** The shipped-skill
  content rules (no taxonomy-profile names, no visibility-value words, executable naming) constrain
  skills contexture authors; upstream text is redistributed as-is and is deliberately exempt.

## Impact

Affected code: the skills sync module gains a second, parallel sync for vendored skills plus a helper
resolving the set of target directories; the adapter type module and both harness adapters take the
interface-version bump; a new skills-only harness adapter and its registry entry; the config schema
and defaults; `init` and the reconcile path each gain one call. Packaging is unaffected — the
vendored payload lands under the already-published templates directory.

Affected stores: additive. A store on the default configuration resolves to exactly one skills
directory and keeps its current layout, gaining one new skill directory on the next update. A store
that declares a second harness adapter receives its skills in both locations. `skills.vendored: []`
removes the vendored directory and returns the store to today's contents.

New third-party redistribution obligations: the vendored payload ships its upstream license verbatim
inside the skill directory, and the repository gains a third-party notices file naming each vendored
component, its upstream, its pinned revision, and its license.

No new runtime dependency, no schema-version bump, and no migration — the new configuration block is
schema-optional with a default, so a store predating it parses unchanged.
