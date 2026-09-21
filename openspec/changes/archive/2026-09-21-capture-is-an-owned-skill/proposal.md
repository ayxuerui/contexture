## Why

Capture is the only stage of the knowledge loop contexture ships no procedure for. Retrieve, organize, distill and express each have both a CLI surface and an owned skill; capture has "write the material into the inbox — no CLI command wraps this" and nothing else. That gap is tolerable while material arrives one pasted article at a time. It stops being tolerable the moment a store wants meeting notes: the material arrives continuously, from a service, in a shape that has to be right, and the store that wants it has no shipped guidance on what right is.

Two facts make this the moment to close the gap rather than leave capture to each store.

**The transport problem solved itself.** The reason contexture has never fetched is sound and unchanged: a vendor client inside `ctxr` puts a third party's release cadence on the toolchain's release path, and the published harness image's tag *is* the `ctxr` version it carries, with a both-directional `schema_version` gate and no migration mechanism behind it. But the meeting-notes vendors now publish MCP servers of their own. A harness connects one; the vendor versions it; contexture never sees it. What is left for contexture to own is the part that does not churn — the procedure, and the shape of a conforming capture — which is exactly the half it should have owned all along.

**A store already declared an invariant that has never run.** A real store's `contexture.yaml` carries `ingest.required_capture_sections: {granola: Transcript}` with a comment stating that it makes `ctxr ingest` refuse a capture missing that section. It does not: `IngestSchema` declares three keys and zod strips the rest, so the declaration is inert and the store has been trusting an enforcement that does not exist. Nothing reported it, either — `doctor` fails an undeclared *top-level* key and a *retired* nested one, but a nested key contexture has never shipped is stripped at parse time and leaves nothing behind to compare against, so it passes every gate in silence. The rule underneath it is contexture's own and is not vendor-specific: a service's AI summary is its *derivation* of the meeting, and the record is the transcript. A capture that is only a paraphrase cannot stand as the provenance behind a note.

That rule needs a mechanism now in a way it did not before. Capture through an MCP server is written by the agent out of its own context, not copied byte-for-byte by a script, so "the transcript arrived summarized" is a live failure mode rather than a hypothetical one. The skill states the rule; the config key is the backstop that catches the run where the skill was not followed.

## What Changes

- **New owned skill `ctxr-capture`**, delivered by `init` and refreshed by `update` like every other owned skill, covering the capture stage for all external material — meetings are the motivating case, not the scope. Its procedure: locate the source among whatever the harness has connected, without assuming one exists; write the record verbatim and retain a source-supplied summary as the source's derivation rather than in place of the record; stamp `source_type` and a `source_id` of the form `<source_type>/<the source's own stable identifier>`, and never `source_hash` or `ingested`; run `ctxr source check` when the material may already be present; write one file per source item into the inbox and stop, handing off to `ctxr-ingest-orchestration`. No vendor, and no specific server, is named in the shipped text.
- **`ctxr-capture` drives tools contexture does not provide**, exactly as `ctxr-submit` and `ctxr-land` drive `git` and `gh`. contexture ships no connector, no credential handling, and no adapter kind for a capture source.
- **New optional config key `ingest.required_capture_sections`**: a map from `source_type` to a section a capture of that type must contain. `ctxr ingest` refuses a capture missing its declared section and exits with the check code; `ctxr lint` reports the same condition as an observation over inbox material. A `source_type` with no entry is unconstrained, and the key is undeclared by default — the store names its own source types, and shipped code names none.
- **The entry document's capture section stops being a dead end**: it names the skill that now carries the procedure instead of only describing the file format.
- **BREAKING**: N/A. The skill is additive and reaches existing stores on the next `ctxr update`; the config key is opt-in, so a store that declares nothing behaves as it does today. A store that has already declared the key gets the enforcement it has been assuming.

## Capabilities

### Modified Capabilities

- `harness-portability`: the set of contexture-owned skills grows by one, and capture joins submit and land as an owned skill whose steps run tools contexture does not provide.
- `context-ingest`: a store may declare, per source type, a section a capture must carry for ingest to accept it as provenance.

## Impact

Affected code: `templates/skills/ctxr-capture.md` (new shipped prose), `src/core/skills.ts` (one `SkillSeed` plus its ordered registration), `src/config/schema.ts` and `src/config/defaults.ts` (the optional key), `src/commands/ingest.ts` (the refusal), `src/core/checks/` (the lint observation), `templates/agents/capture-and-ingest.md` and `README.md` (the procedure now has a home to point at). Tests asserting the owned-skill set and its order, plus new coverage for the refusal and the observation.

No schema-version bump: the key is additive and optional, so a store written by an older CLI still loads.

Delivered to existing stores by `ctxr update`, which overwrites managed skill copies.

## Non-goals

- **Vendor connectors, credentials, or a capture-source adapter kind in `ctxr`.** The release-path coupling argued in Why is the reason, and it is unchanged by this change: transport stays outside the tool. `2026-08-30-owned-skills-expansion` already excluded external-service connectors as "bound to one operator's tools"; shipping a generic procedure over a connected source honours that exclusion rather than reversing it.
- **A `ctxr capture` command.** Capture is judgment about what a conforming record looks like, and the CLI would have nothing mechanical to contribute that `source check` and `ingest` do not already provide. The code/judgment seam puts it in a skill.
- **Unattended, token-free capture.** Reading material through an MCP server routes it via the agent, so a scheduled capture costs tokens where a store-local script costs none. That trade is deliberate and recorded in design.md; the escape hatch, if it is ever needed, is external vendored skills, not connectors in `ctxr`.
- **Validating a capture's *content* beyond declared section presence.** Whether a transcript is complete or faithful is not decidable by a check, and a requirement asserting it would be a cage rather than a gate.
- **Reporting nested config keys contexture has never shipped.** `doctor` catches retired nested keys because contexture maintains a list of them; an invented one has no such list to sit on. Closing that generally is a store-integrity change with its own trade-offs (a store's config is deliberately loose so a newer key never breaks an older load), and folding it in here would widen this change past the capability it is about.
- **Changing how ingest, dedupe, or the capture tier work.** This change adds a precondition to ingest; it does not touch source identity, hashing, retention, or the verdict set.
