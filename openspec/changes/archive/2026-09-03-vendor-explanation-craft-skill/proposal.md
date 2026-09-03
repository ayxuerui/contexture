## Why

The publish skill's step 5 delegates "the craft" as if it were one thing. It is two: the page's visual form, which the vendored design skill covers down to its interface copy, and the page's explanatory prose, which nothing covers — so an agent that follows the skill faithfully still writes body text pitched at the person who sat in the sessions the notes came from, for a reader who did not. The vendoring seam built for the first craft skill was designed plural (the configuration is a list); this is the second entry it was built for.

## What Changes

- Vendor a second third-party craft skill at a pinned upstream revision: `eli5` (MIT), which calibrates vocabulary, analogy, depth, and framing to a stated reader. Like the first, it is redistributed byte-identical with its upstream license and a provenance record.
- Teach the vendoring record that an upstream may keep no license file inside the subtree being vendored. `eli5`'s MIT license lives at its repository root, so the manifest gains an optional repository-relative license path, fetched at the same revision and delivered under the one name the payload, the notices, and delivery already use.
- Assemble the payload through a single function shared by the fetch path and the drift check, so a license sourced from outside the vendored subtree is neither missing from what ships nor permanently reported as drifted by the weekly check.
- Grow the shipped vendored set to two — one skill per craft axis a generated page needs and contexture supplies neither of.
- Rewrite step 5 of the publish skill to delegate both axes by name, draw the seam between them (interface copy versus explanatory prose), and state that neither skill's sense of "audience" is the disclosure audience the gate step evaluates.
- Ship a migration appending the new skill to stores whose declared vendored list still sits at the previous shipped default, so stores already on disk receive it rather than having to hand-edit their configuration.

**BREAKING**: N/A. Every existing store keeps the skills it declares; the new payload is additive, the new provenance field is optional, and an existing provenance record round-trips byte-identical through a re-vendor.

## Capabilities

### New Capabilities

(none — this change adds no capability. It grows a set an existing requirement already enumerates and rewrites prose an existing requirement already governs.)

### Modified Capabilities

- `harness-portability`: the requirement enumerating the shipped vendored set gains the second craft axis and the case of a license kept outside the vendored subtree; the requirement governing what the shipped skills instruct gains a scenario for delegating both halves of the craft.

Deliberately not modified: `store-lifecycle`. Its migration requirements are generic — migrations are named, dry-runnable, and resumable; the schema version is recorded and gated — and no requirement enumerates individual migrations. A migration that satisfies those requirements needs no new one. `publish` is also unmodified: its five requirements govern subject resolution, gating, exit codes, identity, and output invariants, none of which change.

## Non-goals

- **A flag, command, or configuration key for a reader's comprehension level.** `publish gather --audience` names a principal the store is being asked to disclose to, and its answer is a tri-state verdict. Putting a second meaning on the gate's input surface makes a mistake a leak rather than a badly pitched paragraph. The two senses are separated in prose instead.
- **Naming the new skill in any other shipped skill.** The publish skill is the only owned skill that produces prose for a reader outside the store; every other one instructs an agent working inside it, where the store's own shorthand is the correct register.
- **Modifying the vendored text to narrow what it triggers on.** Its description fires broadly, including on requests that have nothing to do with building a page. The redistribution contract is byte-identical content, and an existing requirement already forbids contexture inserting its own content into a file it did not author. A store that does not want the skill removes it from its declared list; that is the intended control, and the Impact section below states the consequence plainly rather than leaving it to be discovered.
- **Retrofitting stores whose operator customized their vendored list.** The migration appends only when the declared list still exactly equals the previous shipped default. An operator who curated the list, or emptied it to opt out, made a decision; silently re-adding a skill would overwrite it.
- **Specifying the maintainer-run drift tooling.** No capability covers `scripts/`, which is absent from the published package. The archived `keep-external-dependencies-current` shipped that entire tool with no spec delta, and the false-drift hazard this change introduces is guarded by a unit test over pure functions plus a live task verification, not by a requirement.

## Impact

- **Shipped payload**: a third vendored directory's worth of files under `templates/vendor/`, plus a regenerated third-party notices file. Packaging is unchanged — `templates` is already published, and the maintainer scripts are already excluded.
- **New redistribution obligation**: one MIT-licensed file whose upstream notice reads `Copyright (c) 2026` and names no holder. The license travels verbatim beside the skill and the notices record what upstream states rather than inferring a holder from the repository's owner.
- **Operator-visible behavior change beyond publishing**: the new skill's description triggers on requests like "explain this", "dumb it down", or "explain this to my manager", including partial matches. Once installed it is discoverable by the harness in every session against that store, not only when a page is being built. This is a general-purpose change to how the agent answers explanation requests, shipped under a publishing banner. It is opt-out, per store, by the declared vendored list.
- **Schema version**: bumped, and this is the change's one uncomfortable edge. The configuration schema's own rule is that the version bumps on a genuinely incompatible change and never on an additive one, and adding a skill is additive. The bump buys guaranteed propagation to stores already on disk — configuration is the store's source of truth and update never rewrites it, so without a migration those stores would receive nothing. The cost is that every existing store reports as needing `ctxr migrate` because a skill was added. The migration's own documentation states this rather than implying the rule permits it.
- **Code**: the vendoring manifest and its fetch script, the vendored-skill default set, an optional provenance field, one new migration and its registry entry, and the publish skill's template body. No new runtime dependency.
