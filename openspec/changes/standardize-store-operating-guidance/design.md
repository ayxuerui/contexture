## Context

pkm's house conventions, split by `lean-composed-entry-document`, turned out to be mostly contexture procedure
written in a store's words. The operator's rule now: a store's own guidance is its house conventions and its mission,
harnesses list the skills, and everything else is contexture's.

## Decisions

### D1. Opinionated defaults ship in the skills, not per store

**Case against:** the routes (session, own, housekeeping), the five-question PR body, and "a critique is required
before an irreversible change" are one operator's habits. Shipping them makes every store inherit them.
**Why ship them:**
- None is specific to pkm's subject matter. Each is about operating a reviewed, PR-only knowledge store, which is
  what contexture is.
- A store that wants different routing says so in its house conventions, which load on every turn and take
  precedence by being more specific.
- Leaving them per store is how pkm's copy drifted from the generated text.

### D2. Document gloss confirmation rather than add a command

The hash is frozen on purpose (like `source_hash`): it records that a gloss was confirmed against the note as it then
stood, and only a deliberate act should move it. Stripping it is that act. The missing piece was the documentation,
whose absence sent agents looping between `doctor` and `build`. A `ctxr catalog confirm <path>` would make the act
explicit and is a fair follow-up, but it adds CLI surface this change does not need.

### D3. The retrieval fallback stays inside the ceiling

The generated-prose ceiling (7,000 bytes) has about 350 bytes of headroom. The fallback is one sentence, and the
graph-cache detail goes in the derived-artifacts skill, which loads only when it is used.
