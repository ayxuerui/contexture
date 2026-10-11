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

The generated-prose ceiling (7,000 bytes at the time) had about 350 bytes of headroom. The fallback is one sentence, and the
graph-cache detail goes in the derived-artifacts skill, which loads only when it is used.

### D4. The ceiling rises, because store content moves into contexture's share

The ceiling exists to stop contexture's generated prose from growing for its own sake. This change grows it, by
about 1.5 KB, with rules every store was already writing in its own conventions (pkm's took 3 KB to say them). The
total per store goes down, and the rules are now consistent across stores. The new ceiling is the measured size
rounded up to the next 500 bytes. It still only goes down from there.

### D5. The store log is on by default

**Case for opt-in** (like `organize.mission_path`): a store that does not want a log gets a hot file every session
appends to, and git history already records what changed.
**Why default on:**
- Git history records *diffs*. The log records *intent* (what was ingested and why, when a lint last ran), which
  is what an agent at session start needs and cannot cheaply reconstruct from `git log`.
- The operator chose it as standard.
- Merge collisions on it are already covered by `ctxr-session-lifecycle`'s hot-file rule.

A store sets `organize.log_path` elsewhere if it wants the file somewhere else.

### D6. Scratch is a configured path

The scratch rule names a place, and the right place differs by machine and harness. On one of pkm's harnesses
`$HOME` is a tracked, auto-pushed directory. `harness.scratch_path` defaults to `/tmp/` and is rendered into the
baseline, so the rule and the path cannot disagree.
