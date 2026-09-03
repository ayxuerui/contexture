## 1. Retire the superseded change

- [ ] 1.1 Delete `openspec/changes/retrieval-legs-hardening/`, its disposition already recorded in this change's `design.md` D14
- [ ] 1.2 Run `openspec list` and `openspec validate --all --strict` — exits 0, and no change named `retrieval-legs-hardening` is listed

## 2. Exclusion admission, before the legs it filters

- [ ] 2.1 Add an error to `src/core/errors.ts` naming an excluded node carried by a persisted graph and the command that rebuilds it
- [ ] 2.2 Extend `loadGraph` in `src/commands/graph-query.ts` — the one loader every graph query already routes through — to compare persisted node ids against `listNotes()` and refuse a graph carrying a node the store no longer admits, leaving an under-inclusive graph answering as before
- [ ] 2.3 Add a fixture store that declares an exclusion after `ctxr graph build` has run
- [ ] 2.4 Run `npx vitest run test/integration/graph.test.ts` — the query exits non-zero naming the node and `ctxr graph build`; after a rebuild the same query exits 0 with the note absent; and a store with a merely out-of-date graph still answers

## 3. Configuration surface

- [ ] 3.1 Add the demoted-prefix list and the pass's note cap to `src/config/schema.ts`, `src/config/defaults.ts` and `src/config/render.ts`, both schema-optional with shipped defaults so no `schema_version` bump is needed
- [ ] 3.2 Seed the demoted list at `init` from the taxonomy's resolved archive destination, read from configuration rather than as a literal
- [ ] 3.3 Run `npx vitest run test/unit/config-schema.test.ts` and `ctxr doctor --json` against a fixture store — exits 0, with no unrecognized-config-key finding

## 4. The pass

- [ ] 4.1 Add `src/core/retrieval/pass.ts`: resolve each entry selector over `listNotes`, `catalogSectionsFor` and the backlink enumeration; expand with `neighbors`; join with the per-note record shape in `src/core/records.ts`; attach entry-reason and qualifier labels; apply the tier-then-hops-then-reason-then-path order
- [ ] 4.2 Apply the note cap after ordering, recording the omitted count and each note's size, so a capped result is a prefix of an uncapped one
- [ ] 4.3 Run `npx vitest run test/unit/retrieval-pass.test.ts` — ordering, deduplication across overlapping selectors, the empty-selector case, and the cap-is-a-prefix property all green

## 5. The command

- [ ] 5.1 Add `src/commands/context-gather.ts` and register it in `src/run.ts` under a `context` group, with the entry selectors, the hop depth, the traversal options `graph query neighbors` accepts, and the cap override
- [ ] 5.2 Run `ctxr context gather --section <id> --json` against a fixture store — a conforming envelope, exit 0, results carrying section, gloss, hash, hop distance and labels, and no note body
- [ ] 5.3 Run the same invocation twice and `diff` the two outputs — byte-identical

## 6. Demotion and its doctor check

- [ ] 6.1 Order demoted notes after non-demoted ones wherever a leg returns an ordered list
- [ ] 6.2 Add the excluded-and-demoted overlap check, registered by appending one import and one array entry to `src/core/checks/manifest.ts`
- [ ] 6.3 Run `ctxr doctor --json` against a store declaring one path both ways — exits non-zero naming the path; against a store declaring an archive prefix demoted only — exits 0, and `ctxr catalog check` still passes for notes under it

## 7. The routing prose

- [ ] 7.1 Rewrite `templates/agents/retrieval-leg-routing.md` as the pass — entry, expansion, widening — naming the command that computes the first two steps, keeping the filename and the fence id, and keeping the statement that there is no search command
- [ ] 7.2 Update the graph-traversal step in `templates/skills/ctxr-connection-finding.md` to name the pass for a neighbourhood with glosses, leaving the point queries as they are
- [ ] 7.3 Run `npx vitest run test/unit/skills.test.ts test/unit/agents-doc.test.ts` — green; then run `ctxr update` twice in a fixture store — the section is rewritten once and the second run reports nothing changed

## 8. Verify

- [ ] 8.1 Run `npm run build && npm run typecheck && npx vitest run` — all green
- [ ] 8.2 Run `openspec validate compose-the-retrieval-pass --strict` and `openspec validate --all --strict` — both exit 0
