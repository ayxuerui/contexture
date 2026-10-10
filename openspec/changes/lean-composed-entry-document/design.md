## Context

Every always-loaded byte is paid for on every turn of every session, in every harness, and the evidence is that more of
them makes each one less likely to be followed. Two harnesses also drop whatever falls past their limit without
saying so.

| Store | `AGENTS.md` | Every-turn content (audit) | Codex sees | Antigravity sees |
|---|---:|---:|---:|---:|
| pkm | 50,770 B | ~5.0 KB | first 32,768 | first ~24,000 |
| readyrun-brain | 35,869 B | ~6.9 KB | first 32,768 | first ~24,000 |

Byte budget by section in pkm (from the audit):

| Section | Bytes |
|---|---:|
| contexture's generated prose | ~12,000 |
| mission | 9,419 |
| operator conventions (one 28,890 B file) | ~29,000 |

Of the 12 KB of generated prose, about 85% of the capture section duplicates `ctxr-capture` and
`ctxr-ingest-orchestration`. The landing paragraph duplicates `ctxr-land`, and the placement layers duplicate
`ctxr-placement`.

What the research found (sources in the exploration that preceded this change):

- **gbrain:**
  - Its `AGENTS.md` is 19.3 KB, organized as a read-order list plus a "when you're working on X → read Y first" table.
  - CI caps its always-loaded docs and ratchets the caps down. The cause was an append-only index that once grew them
    to 592 KB. In gbrain's words, "A written rule caused this disease; a guard cures it."
  - Its standing docs carry current state only.
- **Anthropic:** "Would removing this cause Claude to make mistakes? If not, cut it." Rules that are "only relevant
  sometimes" belong in skills, and imports do not reduce what a file costs.
- **Antigravity:** besides the 24,000-byte per-file limit, all always-on rules share a budget of 20,000 tokens. When
  that is exceeded, the largest files are demoted to pointers.
- **Codex:** it silently truncates the concatenated chain of `AGENTS.md` files at 32 KiB.
- **Studies:**
  - *Evaluating AGENTS.md* (ICLR 2026) found context files slightly reduce task success and cost more than 20% extra.
  - IFScale found instruction-following declines as the count grows, and is biased toward earlier instructions.

## Goals / Non-Goals

**Goals:**
- The operator can decide, per document, what loads every turn and what loads on demand.
- The entry document is held to the smallest limit among the harnesses the store declares, by a check, not a
  convention.
- contexture's own share stays small, and a test keeps it small.

**Non-goals:** see proposal.md. In particular, this change does not decide how the mission is shaped.

## Decisions

### D1. One frontmatter key, `read_when`, rather than a load mode plus a description

A document is on demand exactly when it says *when* to read it. The trigger text is the only thing the index needs, and
it is also the only thing that makes on-demand loading work. A document with no trigger has nothing to put in the
index, so it has to be inlined.

**Case for an explicit `load: always | on-demand` enum:** it is more readable to someone skimming frontmatter, and it
leaves room for a third mode later, such as an Antigravity-style glob trigger.
**Why one key:** an enum still needs the trigger text, so it would be two keys with a dependency between them (a mode
with no trigger is an error). `read_when` reads correctly at the point of use. A third mode can be added as its own
key when there is a harness-portable way to honor it, which today there is not. Codex has no conditional rules at
all.

### D2. Route rather than inline, and keep the inlined default

**The case against the change:** inlining exists because a referenced rule may never be opened. An index depends on
the agent recognizing that a task matches a trigger, while an inlined rule has no such dependency. gbrain's own
`skills/RESOLVER.md` admits the router is only as good as its trigger phrases.

**Why route anyway:**
- Under Codex and Antigravity, the inlined tail is already unread, and the agent cannot know it exists. An index row is
  strictly better than truncation.
- The evidence is that a long always-loaded file lowers adherence to *every* rule in it, so inlining does not buy the
  reliability it promises.
- Skills already work on exactly this trust (load the body when the description matches), in every harness this store
  targets.

**Why the default stays inline:** a store that changes nothing renders the same conventions it did before, and moving
a document to on demand is a deliberate, reviewable one-line edit by its owner. contexture cannot know which of an
operator's rules matter every turn.

**What would flip it:** agents repeatedly skipping an index row for a task its trigger plainly names. The first remedy
would be sharper trigger wording, or a store skill. Re-inlining is the last resort.

### D3. The budget is enforced against declared harnesses, with a target below it

There are two numbers, and each needs its own enforcement:
- **The hard limit is a fact about a harness.** Exceeding it means content is lost silently, so it is a `doctor`
  invariant. It is computed from the declared adapters' effective limits, so a store that declares no limited harness
  is never failed for a limit it is not subject to.
- **The target (20,480 bytes by default) is a judgment about cost and adherence.** The operator asked for 16–20 KB.
  Exceeding it is not broken, so it is a `lint` observation.

**Case for a single doctor-enforced 20 KB cap on every store:** simpler, and it holds even a Claude-Code-only store to
the discipline the evidence supports.
**Why not:** it would fail stores for a judgment call, and the store-integrity spec's split exists precisely to keep
"worth reviewing" out of "broken". A store can lower its own target. The `doctor` check runs at store scope, not in
the staged pre-commit run, so an over-limit store can still commit the edits that bring it under.

This supersedes `support-codex-and-antigravity-harnesses`' lint-only read-limit observation. That change keeps the
adapters' declared limits and the store override; this one owns every size check.

### D4. Store-specific additions to a skill are ordinary on-demand guidance

pkm carries "Session lifecycle — store specifics (overlay on `ctxr-submit`)" and "Capture — store specifics (overlay on
`ctxr-session-capture`)". Together they are 4.6 KB that matter only when one skill runs.

**Case for an `overlays: <skill>` key:** the shipped skill would load its overlay by construction, instead of hoping the
agent cross-references the index while mid-procedure.
**Why not now:**
- Every harness this store targets discovers skills, and an index row whose trigger names the skill ("Before running
  `ctxr-submit` or `ctxr-land`") sits in context the whole session.
- A second mechanism would add a key, a lookup in every shipped skill, and a drift surface, all for two documents.

**What would flip it:** an observed submit that skipped the store's own steps despite the row.

### D5. contexture's prose shrinks by deferring to skills, and a test holds the line

These are the every-turn kernels that remain in the generated sections:

| Section | Kept every turn |
|---|---|
| Fundamentals | root resolution, condensed; the source-identity rule; the note-templates pointer with the kind-field guidance its requirement mandates; the write path; the identity boundary; the push override; folder `README.md` first |
| Retrieval | enter, expand, widen in brief; the named narrowing command; the exclusion list; the graph document path; "there is no `ctxr search`" |
| Capture | where captures go; the two fields never to hand-write; which skills carry the procedure |
| Placement | the layer list (orientation the agent uses on every write) |
| Baseline | the relation vocabulary with definitions and directedness (still required in the entry document by context-retrieval); archiving in one line |

Everything else is procedure a shipped skill already states.

The ceiling test is gbrain's lesson applied: a written instruction to stay short is how the file got long. The ceiling
starts at the measured size after this change, rounded up to the next 500 bytes, and only goes down.

### D6. The index renders after the conventions, last in the file

**Case for placing it right after the fundamentals,** where primacy bias favors it: the index is the router, and a
router read late is a router read less.
**Why last:**
- It is short (about 120 bytes per row), so nothing follows it to push it out of a truncation window.
- With the document held under every declared limit by D3, truncation no longer applies at all.
- Putting it last keeps the operator's every-turn rules adjacent to the fundamentals they refine.

This is cheap to revisit: the order is one constant.

## Risks / Trade-offs

- **The trigger wording is now load-bearing.** A vague `read_when` ("General notes") routes nothing. → The seed comment
  shows the form ("Before <task>…"). A lint check for weak triggers is possible later, once real examples exist to
  judge it by.
- **Stores over a declared harness's limit start failing `doctor`.** → This is intended, and it is visible only once
  the store declares that harness. The remedy (add `read_when` to a document, trim the mission) is in the operator's
  hands, and it is store-scope only, so commits are not blocked.
- **Shorter generated prose may drop something an agent relied on.** → Each cut is procedure a named shipped skill
  carries. Every section names that skill, and the existing tests for those skills' content still hold.

## Open Questions

- **The mission's shape.** It is inlined whole and counts toward the budget. Three options:
  - **(a)** leave its shape entirely to the operator;
  - **(b)** a section budget, `organize.mission_max_bytes`, enforced the same way the conventions budget is;
  - **(c)** inline only a marked current-state part and route the rest.

  pkm's mission is 73% Debt narrative and readyrun-brain's is 41% bet register, so either a budget or a split would
  bite. The decision is the operator's and is deferred to a follow-up change.
