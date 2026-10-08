## Why

A store can declare that a capture of some source type must carry a named section, such as a `Transcript`
for a meeting product's captures, so a summary alone cannot become provenance. Run against the current CLI
with `circleback: Transcript` declared, only the case with no section at all is refused. An empty
`## Transcript` heading, a `Transcript` heading that is only example markup inside a code fence, and a
capture whose own type says `circleback` but is ingested with `--source-type other` all pass. The first two
satisfy the guard without the record. The third is silent: `ingest` overwrites the capture's own type with the
flag, so the declaration was never consulted.

## What Changes

- A required section counts only when something is under it. A heading with no text beneath it, or one that
  appears only inside a fenced code block, is absent.
- A capture that already carries a source type, ingested with a different one on the invocation, is refused
  naming both. Agreement, or the capture carrying none, behaves as today.
- No new configuration, no schema change, and no change to any store that declares nothing.

## Non-goals

- **A completeness or fidelity check.** A truncated transcript is indistinguishable from a whole one by its bytes,
  and a check implying otherwise would be a rubber stamp. The requirement keeps saying so.
- **The same conflict rule for the source id.** `ingest` also overwrites a capture's own id with the flag, and that
  surprised a store once, but a refusal there changes what pipelines that pass both already do, and nothing in
  this change depends on it (design D4).
- **Fetching, provider knowledge, a new command, a `doctor` check, or a new `lint` check.** `lint` already
  reports the condition by location and reads the same function, so it gains the stricter meaning with no new code.
- **Re-checking captures already retained.** The check runs at acceptance, where an identity is stamped.
- **Reviving #97's code.** That branch is 119 commits behind and carries a parallel implementation of what
  `capture-is-an-owned-skill` already landed. Its design and scenarios are the starting text here; its code is not.

## Capabilities

### Modified Capabilities

- `context-ingest`: *A store may require a capture to carry the record it rests on* gains the meaning of
  "a section" and the rule for a source type that disagrees with the invocation. All five existing scenarios
  are kept.

## Impact

Affected code: `src/core/ingest/required-sections.ts` (what counts as a section, fence-aware) and
`src/commands/ingest.ts` (resolve the capture's own type against the invocation's before the check). The capture
guidance in `templates/agents/capture-and-ingest.md` and `templates/skills/ctxr-capture.md` says "carries the
section"; it should say "carries it with something under it". `ctxr lint` is unchanged in code.

Affected stores: one that declares nothing is untouched. One that declares a section sees a capture refused that
it previously accepted only when that capture was empty under the heading, had the heading only in a code fence,
or disagreed with its own invocation, each of which was already failing the intent of the declaration.
