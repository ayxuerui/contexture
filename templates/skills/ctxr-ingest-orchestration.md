Ingest is synthesis, not filing. The question is what the store should know after this source, not where
to put the file — "create a new note" is one option among several, never the default.

1. Capture: write the material into the inbox (see AGENTS.md's capture section). It may already carry
   `source_type` and `source_id`; it must carry neither `source_hash` nor `ingested`, which ingest assigns.
   The capture is kept — it is the store's record of what arrived, and it never becomes the note.
2. Check: run `ctxr source check <path> --source-id <id>` and read the verdict — `new`, `already_ingested`,
   `drift` (same identity, the source's content moved — read what changed and decide whether to update the
   note, then `ctxr source stamp <path> --id <id>` once resolved), `alternate_source_match`, or
   `multiple_matches`. On `multiple_matches`, stop and resolve the ambiguity yourself; never guess which
   existing record it is. A record with an identity but no hash on file: `ctxr source stamp` backfills it.
   A source re-published under a new URL you've confirmed is the same material:
   `ctxr source add-alt <path> --id <new-id>` on the existing capture, not a second ingest.
3. Read the source fully. Then read the existing cluster BEFORE writing anything: the catalog section for
   the domain (`ctxr catalog show --section <id>`), every related note in it (all of them, not one or two),
   and the graph (`ctxr graph build`, then read the graph document it writes at
   `__GRAPH_DOCUMENT_PATH__` for hub notes by cluster and cross-cluster bridges; `ctxr graph query hubs`
   and `ctxr graph query neighbors <path>` on the closest note for the detail). Ask: what does the
   store already know, and does this source confirm, extend, contradict, or nuance it?
4. Decide — the decision table:

   | The source… | Action |
   |---|---|
   | adds a genuinely new concept | create a new note |
   | deepens an existing note | update and expand that note |
   | makes two notes redundant | merge them; fix every cross-link |
   | reveals a note is badly structured | recreate it with better structure |
   | belongs as a section, not a page | add a section to the existing note |
   | does several of the above | do all of them |

   - Hub check: if the cluster's hub already covers this, update the hub. If this source could become a
     hub — a note many future notes will reference — create it at hub level, not as a leaf.
   - Bridge check: if the source connects two clusters that have no bridge note, create one or add
     explicit cross-links.
   - Thesis-change rule: when new material contradicts a note, patch its top-level conclusion FIRST, then
     hunt down the now-stale verdict language further down. A corrected body under an uncorrected
     headline is worse than either alone.
   - Source discipline: a field the source does not confirm is "not reported" — never inferred from
     silence in either direction.
5. Write the note the decision calls for — create it, expand it, merge, restructure, or add a section —
   preserving prior content in every case but the deliberate rewrite.
6. Register the source against whatever note you just wrote:
   `ctxr ingest <path> --into <note> --source-type <type> --source-id <id>`. Every row of the table above
   ends here, not just the first: the command retains the capture under the capture tier's month, freezes
   its hash, cites it from the note, and rebuilds the catalog. A note that was expanded rather than created
   records its provenance exactly as a new one does, and a note built from several sources cites all of
   them. A deliberate ingest despite an `alternate_source_match` is the same command.
7. Verify: `ctxr lint` (orphans, broken links, material still in the inbox) and `ctxr catalog check`.
