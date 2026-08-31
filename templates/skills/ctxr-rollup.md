Regenerate the machine-synthesized current-state region of an entity note (a person, organization,
product, initiative, or topic hub) from every note that references it. Hand-written content outside the
fenced region is never touched.

Run `ctxr rollup stale` (or `--for <entity>` for one) to find entities worth re-rolling — it lists every
entity note whose backlinks have moved since its last synthesis, or which has never been rolled up at
all; use it instead of guessing from memory which entities are out of date.

1. Resolve, never create. `<entity>` is a path or a note name; several candidates → list them and ask.
   When a location has more than one plausible hub, prefer the shorter-named, undated one. If no entity
   note exists, STOP and say so — creating it is a separate task, not a side effect of a rollup.
2. Refuse non-entities. Dated notes, journal entries, meeting notes, generated files, and store
   infrastructure are INPUTS to rollups, not entities. If the name resolves to one of those, stop and ask
   which entity was meant.
3. Gather: `ctxr rollup gather <entity>` enumerates the candidate sources (notes linking to it). Fewer
   than 3 accepted sources → push back ("only N notes reference this; a rollup would be thin — continue?")
   and do not auto-continue.
4. Read EVERY accepted source, not a sample — the value of a rollup is total recall over the entity's
   corpus. Per source note its date (filename, frontmatter, then mtime as a last resort), its kind, and
   what it says about THIS entity specifically. For a long source, grep for the entity first.
5. Synthesize into a file, in this shape — bullets throughout, short clauses; skip any empty subsection
   silently (never "N/A", "none", or "TBD"):

   ```
   ## Current state
   ### Status            — one fact per line; what it is, what is happening now, headline problem or metric
   ### Recent activity   — `YYYY-MM-DD — what happened [[Source]]`, most recent first
   ### Open threads      — unresolved decisions, blockers, pending actions; each links where it was raised
   ### Key people        — `[[Person]] — role in this entity's orbit`; only people present in the corpus
   ### Sources           — every note consulted, sorted; the audit trail
   ```

   Provenance rules: every fact traceable to a source note — nothing from memory or earlier conversation;
   no editorializing or recommendations; nothing dated later than today; inline `[[wikilinks]]` when one
   claim has one clear source.
6. Write: `ctxr rollup write <entity> --content-file <file>` — an idempotent fenced write (`changed: false`
   and a byte-identical file when the content matches; mismatched markers abort with nothing written).
7. Report: entity path, sources accepted, `changed` or unchanged, and notable findings (e.g. the oldest
   unresolved thread). Anything outside the fence you want to fix is a separate, explicit edit.
