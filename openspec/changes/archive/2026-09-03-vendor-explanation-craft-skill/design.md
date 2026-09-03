## Context

See proposal.md — Why. The constraints that shape the approach:

- The vendoring pipeline fetches everything under a manifest entry's `subpath` and writes it verbatim into a packaged directory, recording a provenance hash of the delivered skill file. The weekly drift check compares that committed payload against the same subtree at the tracked branch's head and reports any difference. `scripts/` is absent from the published package, so this is maintainer-only tooling with no capability behind it.
- The upstream being vendored breaks an assumption baked into that pipeline: its skill directory contains exactly one file, and the license that governs it sits at the repository root, outside the vendored subtree.
- The publish skill's prose lives in a template, rendered per store, and is pinned by exact-substring assertions — two of which currently span a line break, so re-flowing a paragraph fails the suite.
- `init` writes the *resolved* vendored list into the store's configuration, and update never rewrites configuration. A change to the shipped default therefore reaches new stores only.

## Goals / Non-Goals

**Goals:**

- Deliver a second craft skill through the existing seam without special-casing it anywhere in `src/`.
- Make the redistribution obligation mechanical rather than remembered, at the earliest point it can fail.
- Keep the weekly drift check honest for an entry whose license comes from outside the vendored subtree — neither silently exempt nor permanently drifted.
- Say, in the publish skill, which craft skill answers which question, and keep the two senses of "audience" apart.

**Non-Goals:**

- Generalizing the vendoring pipeline beyond what this upstream needs. One optional field, not a layout descriptor.
- Any change to how a vendored skill is delivered, refreshed, preserved when locally modified, or bridged to a harness. Those requirements already hold for N entries; this change adds an entry, not a mechanism.

## Decisions

### An optional repository-relative license path on the manifest entry

The entry gains `licensePath`, naming a file relative to the upstream repository root, fetched at the same revision as the skill and written into the payload as `LICENSE.txt`.

Alternatives considered. *Committing the license by hand* — rejected: the payload's integrity guarantee is that every file in it was fetched, and a hand-placed file makes the provenance record a claim rather than a record. *A URL instead of a repository-relative path* — rejected: a URL cannot be resolved at a pinned revision, so the license would drift out of step with the skill it governs. *Declaring the whole payload layout in the manifest* — rejected as premature; one upstream needing one extra file does not justify a layout language.

`LICENSE.txt` stays the single name the payload, the notices, delivery, the integrity test, and the drift check's special-case warning already use. The field is absent — not set to a null — for an entry whose license sits inside its subtree, so the existing committed provenance record round-trips byte-identical through a re-vendor.

### Payload assembly is one pure function, shared by the fetch path and the drift check

This is the load-bearing decision, and the reason it is a decision rather than an implementation detail.

The drift check compares the committed payload against the upstream *subtree*. A `LICENSE.txt` sourced from outside that subtree is never in it. So the obvious implementation — teach only the fetch path about `licensePath` — makes the new entry differ from upstream on exactly one file, forever. The weekly workflow would file a drift issue every week for a repository that has not changed. A false alarm on a schedule is not a small bug; it is how the alarm stops being read, including for the entry that is genuinely drifting.

The fix is structural rather than defensive: a pure `assemblePayload(entry, subpathFiles, externalLicense)` returns the complete payload at one revision, and *both* the fetch path and the drift check build their picture of upstream through it. They cannot disagree, because there is only one answer. A sibling `differingPaths(upstream, committed)` holds the comparison. Both live in the manifest module, which already has no I/O precisely so a test can import it — which makes this hazard unit-testable without network access, the only way it is testable at all.

Alternative considered and rejected: *exclude `LICENSE.txt` from the drift comparison.* It is a one-line fix and it is wrong. It silences the single difference that is a redistribution decision rather than a routine refresh — the check prints a distinct warning for exactly that case — so the cheap fix trades a weekly false positive for a silent false negative on the one file where being wrong matters most. The drift check instead fetches the license at the tracked head and compares it like any other file.

### The redistribution obligation fails at fetch time

`assemblePayload` throws when an entry has neither a license inside its subtree nor a `licensePath`, and also when it has both (an upstream that started publishing one beside the skill, making the manifest field stale). This turns "each vendored skill SHALL be accompanied by its upstream license file" from a property a test notices afterwards into one the pipeline cannot violate. Inside the drift check the throw surfaces as the existing "could not determine" exit rather than as drift, which is the correct reading: an upstream deleting its license is not a routine refresh.

### The notices record what upstream states, not what we infer

Upstream's license reads `Copyright (c) 2026` and names no holder. The notices entry says so and points at the verbatim file, rather than naming the repository's owner — a repository owner is not necessarily the copyright holder, and this is a legal-notice file contexture publishes. A conditional "license source" line marks entries whose license came from outside the vendored subtree, so the notices do not imply it shipped beside the skill when the source line names only the subtree.

### The publish skill delegates two named axes, and separates two senses of one word

The seam between the two craft skills is drawn on *what kind of words*, because both of them talk about writing: the design-focused skill owns the interface's own words (labels, controls, empty and error states), the reader-calibration skill owns the prose that explains the subject. Without that line stated, an agent loads whichever it encountered first.

The harder problem is that "audience" already means something in this skill. The gate step names a principal the store is being asked to disclose to and returns a verdict; the craft skill means how much a reader already knows and returns a register. Conflating them lets "write this more plainly for a non-expert reader" be heard as "disclose this more widely" — a leak, not a badly pitched paragraph. The skill therefore states the distinction explicitly and forbids passing a level of knowledge to the gate. This is prose, not a mechanism, and it is stated as such: the enforcement is the gate itself, which is unchanged.

Alternative considered: *a second flag or configuration key carrying the reader's level.* Rejected — see proposal.md, Non-goals. It would put a rendering preference on the input surface of the gate, where a mistake is a disclosure failure.

### Propagation to existing stores is a migration, at a known cost

Configuration is the store's source of truth and update never rewrites it, so a store already on disk receives nothing from a change to the shipped default. A migration is the only mechanism that reaches it.

The cost is stated rather than hidden: the configuration schema's own rule is that the schema version bumps on a genuinely incompatible change and never on an additive one, and adding a skill is additive. This migration bumps it anyway, and every existing store will consequently report as needing migration because a skill was added. The migration's documentation says this in those terms rather than implying the rule permits it.

The value half is conditional, using the heuristic two earlier migrations already established: append only when the declared list still exactly equals the previous shipped default. A list that was curated, or emptied to opt out, is a decision; re-adding to it would overwrite that decision. Such a store gets a bare version bump. Pending-ness is the recorded schema version, never the list's contents — the rule every prior migration follows, because a schema-optional default populates the key on an unmigrated store too, so its presence cannot distinguish migrated from not.

Alternatives considered. *Document it and let operators hand-edit one line* — the cheaper option, and the one that respects the schema rule; rejected because it makes the shipped default a lie for every store that predates it. *An informational finding from update* — rejected: it nags forever in any store that deliberately dropped the skill, and would need its own requirement to specify.

## Risks / Trade-offs

- **The vendored skill triggers far more broadly than the existing one, and lands in every store that takes the default.** Its description fires on ordinary requests to explain something, not only on page building, so it becomes discoverable in sessions with nothing to do with publishing → Not mitigable by narrowing the text: an existing requirement forbids contexture altering a file it did not author, and the redistribution contract is byte-identical content. Mitigated instead by making it a documented consequence in the proposal's Impact rather than a discovery, and by the per-store opt-out the declared list already provides.
- **A thin upstream: one file, one author, and a copyright notice naming no holder.** → The MIT grant is valid and verbatim redistribution plus an honest notice discharges the obligation. The standing mitigation against upstream rewriting it underneath us is the tracked branch plus the weekly drift check plus a reviewed pull request for every refresh. Worth a courtesy upstream issue asking them to name the holder.
- **A schema version bump the configuration schema's own rule argues against.** → Accepted deliberately, in exchange for guaranteed propagation; recorded in the migration's documentation and in the proposal's Impact so the precedent is not read as permission.
- **The two exact-substring assertions on the publish skill span line breaks, so re-flowing its prose fails the suite.** → The replacement text is wrapped to preserve both breaks, so it lands without a test change; but the assertions are then converted to whitespace-tolerant forms in the same change, because a test that fails on re-wrapping pins the column rather than the rule.
- **A second vendored entry worsens two pre-existing order-dependent assertions** that select "a skill" from an unsorted directory read and assert something only owned skills carry. → Both are made deterministic here (select by name; sort the payload walk) rather than left to better odds.

## Migration Plan

The payload and the provenance field are additive: an existing store's vendored directory, provenance record, and notices entry are unchanged, and a re-vendor of the existing entry produces identical bytes.

One store-side migration ships, appending the new skill to a declared vendored list that still equals the previous shipped default, and bumping the recorded schema version. It is planned and applied through the existing migration mechanism, so it is dry-runnable and resumable without a new mechanism: pending-ness is the recorded version, the config write re-reads from disk before writing, and a second run reports nothing pending.

Rollback is per store and needs no tooling: removing the skill from the declared list makes the next update remove the directory, provided it has not been locally modified — the existing opt-out path, unchanged by this change.
