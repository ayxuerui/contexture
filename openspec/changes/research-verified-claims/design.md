## Context

See proposal.md for why. `ctxr-research` (`templates/skills/ctxr-research.md`, about 7.2 KB) is shipped to every
store and runs under Claude Code, Codex and Antigravity. Each harness has different web access, and some have no
delegation at all. It lands results through `ctxr-capture`, `ctxr-ingest-orchestration` and `ctxr-placement`.

## Evidence

Three surveys were run on 2026-10-13. This table lists the practices that change the skill.

| Practice | Evidence | Strength |
|---|---|---|
| Keep a claim only when a quote from an opened source supports it | FActScore (58% of claims supported), SAFE, VeriScore; DeepTRACE (citation accuracy 40–80%); Cited-but-Not-Verified (fact-check accuracy 39–77%, −42% with run depth) | strong |
| Never cite an unopened URL; cite the original, not a syndicated copy; read the full document | Mind2Web 2 (hallucination up to 23%: links never opened, fabricated URLs); Tow Center 2025 (syndicated copies, broken URLs); BrowseComp-Plus (full documents +8 points) | strong |
| Verify with fresh evidence, without the draft in view | CoVe "factored" variant; CRITIC (tool-backed critique) | moderate–strong |
| Plain self-review without new evidence does not work | Huang et al. 2024; Kamoi et al. TACL 2024; Panickssery et al. (models prefer their own output) | strong (negative) |
| Scale effort to the question; search broad, then narrow | Anthropic multi-agent research (token use explains 80% of variance); BrowseComp scaling curves | strong |
| Stop on coverage, not on feel; keep a findings log | Mind2Web 2 (incompleteness, early stopping); FutureSearch DRB (forgetting is the top predictor); HALT | moderate |
| Read laterally; trace a claim to its original (SIFT) | Wineburg & McGrew (fact-checkers vs historians and students); a randomized field study | strong for humans, moderate for agents |
| Fetch the other side on contested questions | DeepTRACE (55–95% one-sided); DRB II (unstable under conflicting evidence) | moderate |
| Order evidence newest-last for time-sensitive facts | FreshLLMs; lost-in-the-middle | moderate |
| Second opinion from a different model family, with sources in hand | cross-family verification (2512.02304); correlated errors across providers (2506.07962) | moderate |
| State likelihood as a numeric range, separately from confidence | ICD 203; readers misread words alone (32% match vs 66% with numbers); 888K forecasts lose accuracy when rounded to words | moderate |
| Judge source reliability and claim corroboration separately | Admiralty-code studies (trust follows the source, not the claim) | weak–moderate |
| Brief as the contract; one writer; ledger-bound outline | LangChain open_deep_research (brief as evaluation standard; parallel section-writing came out disjointed); WebWeaver (outline cites evidence IDs); Anthropic (lead writes, citation pass) | moderate (system design) |
| Fetched content is data, never instructions | OpenAI deep-research guidance; feiskyer and 199-bio skills | design consensus |
| Behavioral evidence over stated opinion; independent check for each vendor claim | grapeot context-infrastructure (unlicensed: idea only, restated) | practitioner |
| Delegate brief contents; no nested delegation; capped fan-out | Anthropic (vague briefs duplicated work; 50-agent blowups); SeanEllyJames (149-agent incident) | practitioner |

## Decisions

### D1. Keep and rework `ctxr-research` rather than vendor a skill

**The case for vendoring.** The most popular research skills have thousands of users and active maintenance
(Weizhena has 2.3k stars and was updated in August 2026). Adopting one means contexture stops owning research
method, which is not its core.

**Why we keep ours.** A vendored skill must still be harness-agnostic and land its results in the store. Every
candidate fails one or both: each hardcodes a search stack and writes to its own directory, two have no license,
and two use words the shipped skills avoid. Our store-first framing, one scoping question, contradiction map, and
judging against existing notes appear in none of them. Adapting about six of their practices costs less than
forking one and removing its toolchain.

### D2. Verification replaces self-review as the center of review

The current §7 asks the agent to re-read its draft for dropped tensions and invented links. The evidence says
re-reading without new evidence is unreliable. The new §8 makes every check an evidence check: claims are matched
to ledger quotes, load-bearing claims are re-checked with fresh searches without the draft in view, and citations
are upgraded to primary sources. The over-association check stays, as a question about evidence: does a single
source connect these two facts?

**The opposing case.** Claim-level verification is expensive. It roughly doubles the fetches on a long report,
and an operator who asked a quick question doesn't want it.

**Mitigation.** The effort class from §1 scales the work. A single-fact answer verifies its one claim. Full
decomposition applies to findings someone will act on and to what lands in the store.

### D3. The ledger lives in the scratch area, not the store

Findings with quotes are the raw material, not the note. Writing them into the store would put unreviewed text
where retrieval finds it. The ledger stays at `__SCRATCH_PATH__` beside the fetched corpus, so a follow-up pass
re-reads it. What a decision rests on is captured through `ctxr-capture`, as now.

### D4. No Analysis of Competing Hypotheses

**The case for it.** One surveyed skill (SeanEllyJames) asks for falsifiable hypotheses up front, and ACH is the
intelligence community's standard technique.

**Why not.** In randomized studies of analysts, ACH did not improve accuracy, increased incoherence (probabilities
summed to 1.77), and analysts skipped its steps. What measurably helped was making the probabilities sum to 1 and
aggregating independent judgments. The skill gets two things from this: the draft-first loop, where a skeleton
answer drives the next searches, which is TTD-DR's draft-then-revise approach, and a sum-to-1 rule when competing
explanations are given probabilities. It does not get a hypothesis matrix.

### D5. Size

The rewrite stays at or under 12 KB, enforced by a test. It is a rewrite, not an append: existing prose that the
new steps absorb (the current self-review, the scattered delegation and pacing lines) is removed, not kept beside
them.

## Risks / Trade-offs

- **[A longer skill gets skimmed]** → Each section opens with its rule in one sentence. The verification step is
  named in "When" and again at the end, so an agent skimming to §8 still finds it.
- **[Agents mark everything "unsupported" to be safe]** → The skill says unsupported means cut it or mark it as
  inferred, and that a result made only of caveats has to say what would settle each one.
- **[Numeric likelihoods look falsely precise]** → Use ranges, never point values, and say that a range wider
  than the evidence supports should be widened, not narrowed.
- **[Several 2026 results are preprints]** (DRB II, HALT, cross-family verification) → None of them is the only
  support for a practice in the skill. Each one sits beside a peer-reviewed or vendor-documented source in the
  table above.
