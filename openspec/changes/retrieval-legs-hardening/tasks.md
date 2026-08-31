## 1. Measurement first

- [ ] 1.1 Add the fixture corpus: notes spanning more than one visibility value and more than one scope, plus query fixtures each declaring its own expected note set
- [ ] 1.2 Implement the evaluation over the corpus, computing the recall-miss rate (naming every missed note and the fixture expecting it) and the leak count (naming every offending note, context, and leg)
- [ ] 1.3 Write the baseline in a stable, diff-readable, timestamp-free form; compare a run against the committed baseline, failing on a worsened recall-miss rate and reporting without rewriting on an improved one
- [ ] 1.4 Run the evaluation twice against the unchanged store — byte-identical output both times, exit zero — then commit the pre-change baseline

## 2. Leak gate

- [ ] 2.1 Make the leak count fail the run non-zero regardless of baseline, and cover it with a fixture whose visibility configuration would leak if a leg post-filtered instead of pre-filtering
- [ ] 2.2 Run the evaluation against a deliberately broken filter in a test double — exits non-zero naming the note, context, and leg; restore and confirm exit zero

## 3. Aliases

- [ ] 3.1 Add the alias frontmatter field (key read from configuration with a shipped default) and index every declared alias at graph build
- [ ] 3.2 Resolve links and catalog lookups through the alias index; report a link resolving to no note or alias as dangling exactly as today
- [ ] 3.3 Fail the build non-zero, naming both notes and writing no artifact, when two notes declare the same alias or an alias collides with a note identity
- [ ] 3.4 Run `ctxr graph build --json` against a fixture store where one note links to another by alias — the edge is recorded and no dangling link is reported; against a colliding fixture — exits non-zero naming both notes

## 4. Demotion

- [ ] 4.1 Add demoted path prefixes to configuration, separate from exclusions, and order demoted notes after non-demoted ones wherever a leg returns an ordered list
- [ ] 4.2 Add a `doctor` check failing a path declared both excluded and demoted, registered by appending one import and one array entry to the check manifest
- [ ] 4.3 Add the catalog section tier with a shipped default, ordering higher tiers first and preserving existing ordering within a tier
- [ ] 4.4 Run `ctxr catalog show --json` over a store with a demoted prefix — demoted entries are present, ordered last, and satisfy `ctxr catalog check`; run `ctxr doctor` on a store declaring a path both ways — exits non-zero naming the path

## 5. Routing

- [ ] 5.1 Implement the routing command: classify a supplied question deterministically and offline, returning the leg and the reason
- [ ] 5.2 Add a test asserting the command's routing matches what the generated procedure documentation states for a structural, a conceptual, and a known-literal question, so the two cannot drift silently
- [ ] 5.3 Run the routing command twice on the same question — identical output, exit zero, no network access

## 6. Verify

- [ ] 6.1 Re-run the evaluation against the post-change store and record whether aliases, demotion, and tiers moved the recall-miss rate; update the committed baseline as a reviewable diff
- [ ] 6.2 Run `npm run build && npm run typecheck && npx vitest run` — all green
