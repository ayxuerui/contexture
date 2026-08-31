Link DISCOVERY — complementing `ctxr-connection-finding`, which traverses links that already exist.

1. Read the target note in full. If given a name instead of a path, find the file; several candidates →
   ask which one, never pick.
2. Extract its key concepts, entities (people, organizations, products), claims, and tags.
3. Search the store with those terms: content search (grep) for the phrases, the catalog section for the
   domain (`ctxr catalog show --section <id>`), and `ctxr graph query neighbors <path> --depth 2` for
   two-hop candidates the note does not link directly.
4. Read every candidate before proposing it. A keyword match is not a connection; each proposal states in
   one line why the link is meaningful to a reader of the target note.
__RELATION_GROUPING_STEP__
6. Confirm before writing: present the grouped proposals and wait for approval by item. Do not write on
   silence or on plan-level agreement.
7. Write approved links into the matching section of the target note, creating the relation sections the
   sibling notes use when the note lacks them. No other edits to the note in the same pass.
8. Report: notes scanned, proposals per group, links written, and nearby orphans
   (`ctxr graph query orphans`) that would also benefit from linking.
