## Why

pkm retired its `research-assistant` skill in favor of `ctxr-research` (contexture 0.22.0). Three practices from it
did not carry over. Each is generic research discipline rather than anything particular to that store:

- **Delegated research loses its grounding without notice.** A delegated agent often lacks the web access its
  parent has, falls back to what it remembers, and returns figures that read as if they were sourced.
  `ctxr-research` covers the harness that has no web access (it says so and stops), but not a delegate that
  silently has none.
- **Open-source options get a footnote.** When a comparison covers products, open-source options get scored
  more thinly than commercial ones, so the comparison is decided before it starts.
- **A deliverable gets crowded out by reading.** When the ask includes a report or page, a session can spend
  itself on sources and finish with a corpus and no result.

## What Changes

`ctxr-research` gains three short instructions, about 900 bytes in total:

- **§2 Perspectives:** when the question compares products or tools, open-source options are an axis of their
  own, scored at the same depth as commercial ones (license, project activity, the cost of running it
  yourself, hosted against self-run).
- **§3 Search:** a delegated agent is told to mark every figure it could not verify against a fetched source.
  Those marks, and a verification-status note at the top, stay in anything that reaches the store.
- **§6 Synthesize:** when the ask includes a report or published page, stop reading once the sources are mapped,
  the key claims extracted and the gaps named. Write the synthesis note first and build the artifact from it.

## Non-goals

- **pkm's ⚠ glyph and callout syntax.** The skill says what to mark and where the note goes, not which glyph or
  Obsidian callout to use. A store may standardize that in its house conventions.
- **A follow-up-pass procedure.** The old skill's "match the prior output shape, fetch only the new axis" is
  mostly covered already: §3 keeps the fetched corpus so a follow-up re-reads rather than re-fetches. The rest
  of it is taste.
- **Enforcement.** These are instructions to the agent. Nothing checks a delegate's output for marks, and the
  specification says so.

**The case against shipping these:**
- The skill is about 7.2 KB, and every generic tip added makes the rest easier to skim past.
- An open-source axis reads like one operator's preference.

**Why ship them anyway:**
- The delegation rule is the skill's own purpose ("grounding beats fluency") applied to the one path it misses.
- The open-source rule is about the completeness of a comparison, and applies only when products are compared.
- The pacing rule protects the deliverable the operator asked for.

Together they add about 12% to the skill. They don't touch the entry-document budget, because a skill is not
inlined.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: the research skill states the delegation, open-source and pacing practices.

## Impact

- `templates/skills/ctxr-research.md`, `test/unit/skills.test.ts`.
- **Downstream:** stores receive the text through the next release's re-render. Nothing to migrate.
