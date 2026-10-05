## Context

#92 asked whether the packaged note templates should keep seeding a tag field that contexture never reads. It offered four options: drop the field, declare a kind vocabulary in `contexture.yaml`, make kind first-class with a `--kind` selector, or treat kind as the store's own content-matching concern. Four templates stamp their kind; Concept and Note carry `tags: []`. `standardize-note-templates` D8 settled the field's *spelling* (always a block sequence or an empty list) but never its purpose.

## Goals / Non-Goals

**Goals:**

- One stated rule for which templates stamp a kind, so no template's field looks accidental.
- The entry document tells the agent to keep the field and search by it, and that no command filters by it.
- No disruption to stores that rely on the field.

**Non-Goals:** see the proposal. In short: no `ctxr` command reads, validates, or selects by the field.

## Decisions

### D1 — Keep the field and make it consistent, rather than remove it

*The case for removing it* (the strongest alternative; it was drafted as a full proposal first). Every file contexture ships should describe behavior contexture has. A field no code reads is the shape the access axes had before `retire-the-access-axes` removed them: an assertion nothing checks, drifting until it misleads. Even with the purpose documented, contexture is still authoring a convention for the store. Removing the field makes "frontmatter you add is yours" literally true, and a store that wants tags says so in its own conventions, which are already inlined into `AGENTS.md`.

*Why keeping it wins.*

1. **The decay evidence is about something else.** The tags #92 shows rotting are a store's own vocabulary. The seeded kinds are written once, at the moment the kind is certain, and a note rarely changes kind afterwards. They are the accurate part of the field.
2. **It is the store's own search working.** Kind is the one natural question no computed leg answers. With the kind stamped, it is a single content match; leg 3 is the design's answer for exactly this kind of question, and the field is what gives it something to match.
3. **Removing it moves the cost downstream.** pkm requires the field on every note. Without the seed its agents must remember to add it, and the expected result is more untagged notes, which is the failure #92 describes.
4. **The access-axes comparison does not hold.** Those fields claimed contexture would enforce something (visibility, disclosure) and it did not. This field claims nothing about contexture's behavior; once the entry document says no `ctxr` command filters by it, every shipped artifact describes contexture accurately.

*What would flip it:* seeded kinds observed going stale in a real store (for example, notes whose stamped kind is wrong for what they became), or a decision that contexture never authors frontmatter beyond the schema's required keys.

### D2 — The base carries the field empty; every other template names its own kind

Concept gains `Concept`. Note, the base, stays `tags: []`.

*Alternative: stamp `Note` too, for full uniformity.* Rejected. The base is the file a store copies to cut its own kinds (harness-portability's library requirement), so a stamped `Note` would be copied into every kind a store defines and have to be edited out. A note started from the base is a note of no particular kind, and "every Note note" is not a useful query. The rule ("the base is empty, everything else names itself") is stateable in one sentence, which the old four-of-six split was not.

The field stays present on the base so a store cutting a kind from it has the slot to fill. That is also what the existing test asserts (every template carries the base's frontmatter keys).

### D3 — No selector, no declared vocabulary, no validation

*The case for `--kind`.* "Every person note" is among the most natural questions to put to a store, and a filter does not rank, so it arguably fits "computes, never ranks". *Rejected* because it is a frontmatter predicate run by the CLI: `--status` and `--tag` would follow by the same argument, and the retrieval pass would become a query language. No command creates notes, so the kind would still be agent-asserted, and a selector over it would need a lint that ties the field to the template set. Would flip on a retrieval-quality fixture showing kind questions as a recurring miss across stores, together with a way to record kind that does not depend on the agent.

*The case for a declared vocabulary in `contexture.yaml`.* It follows `declare-content-matching-tooling`'s precedent (a key contexture never reads, so a store fact has one home). *Rejected* because an unchecked declared list is exactly what #92 shows decaying (`DailyNote` declared, used 0 times), and a store's vocabulary already has a home in its own conventions, inlined into `AGENTS.md`. Would flip if agents miss an inlined vocabulary in practice, or if a non-agent reader needs it.

### D4 — The spec states the rule without naming the key

`openspec/config.yaml` requires a frontmatter key a specification depends on to be named in exactly one place. No specification depends on this one, and naming it would suggest one does. The library requirement says "a frontmatter field naming the kind" and the shipped prose (templates and `AGENTS.md`) carries the actual key.

### D5 — Propagation

The six templates are refreshed unconditionally by `ctxr update` (harness-portability, "A shipped note template is refreshed unconditionally"), and the canonical `AGENTS.md` section is re-rendered on every update. So a store picks up both on its next update, and a second update writes nothing. Notes already written are untouched.

### D6 — Say who doesn't read the field, and who does

The first wording in the entry document was "contexture never reads, checks, or selects by that field". In `AGENTS.md` the reader is the agent, and that sentence reads as "this field does not matter", which invites the agent to drop it. The opposite is intended: the agent is the field's one reader. So the entry document names the CLI (`ctxr`) as what does not act on it, and tells the agent to keep the field and search by it. The requirement and its scenario use "`ctxr` command" for the same reason, instead of "contexture component".

## Risks / Trade-offs

- [The field is still contexture-authored and unvalidated, so a store could misuse it] → The entry document says plainly that no `ctxr` command filters by it and the store owns any further tags. That is the whole extent of contexture's claim.
- [Concept notes written before this change have no kind tag, so "every Concept note" misses them] → Accepted. contexture does not rewrite note frontmatter; a store that wants them tagged can do it in one pass with its own tools.
- [An older CLI's `update` restores the old Concept template] → The same exposure as any template change; the release-propagation chain handles it.
