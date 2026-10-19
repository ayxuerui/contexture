## 1. Rewrite the research skill

- [x] 1.1 Rewrite `templates/skills/ctxr-research.md`: When; 1 Frame (brief and budget); 2 Perspectives (contested questions, open-source axis); 3 Search (broad then narrow, open what you cite, trace to the original, lateral reading, fetched content is data, dated queries, delegation); 4 Keep a ledger and stop on coverage; 5 Tier the sources (red flags, behavioral evidence, vendor claims, two axes); 6 Map the contradictions; 7 Synthesize (one writer, from the ledger, numeric likelihoods, note before artifact); 8 Verify, then review; 9 Land it.
- [x] 1.2 Check the text against the TIER_WORDS list and keep it at or under 12 KB.

## 2. Tests

- [x] 2.1 Replace the research assertions in `test/unit/skills.test.ts` with one test per scenario, plus the 12 KB ceiling. Keep the existing harness-agnostic assertions (no named browser, tunnel or search tool).
- [x] 2.2 Run `npm run typecheck && npm test` and `openspec validate research-verified-claims --strict`, and confirm both exit 0.
