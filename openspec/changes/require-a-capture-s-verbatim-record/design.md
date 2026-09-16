## Context

See `proposal.md` — Why. The shape of the problem surfaced while designing a meeting-notes ingestion path.
Three candidate sources were examined closely, and they agreed on almost nothing: their tool vocabularies
differ entirely, one of them does not publish its vocabulary at all, and each gates transcript access behind a
different plan tier. What they did agree on was the failure mode — every one of them hands an agent a summary
first, cheaply, and the verbatim record second, expensively or not at all.

Two successive drafts of that work tried to put the source knowledge inside contexture: first as shipped skill
prose naming each product's calls, then as a `meeting-source` adapter kind with a built-in adapter per vendor.
Both were abandoned for the same reason, recorded here because it is the load-bearing judgment of this change:
the volatile part belongs to the harness, and only the durable part belongs to the store. What is left once
the volatile part is removed is small, general, and enforceable — which is the whole of this change.

## Goals / Non-Goals

**Goals:**
- Let a store say which of its captures owe a verbatim record, and where that record lives in the file.
- Refuse, at the moment provenance is recorded, a capture that does not carry one.
- Keep contexture's distance from every source total: no fetch, no credential, no vendor name.
- State the rule in a way that is true for any source kind, not only the one that prompted it.

**Non-Goals:** see `proposal.md` — Non-goals (no fetching or source knowledge, no adapter kind, no new skill,
no completeness judgment, no reserved literals, no `doctor` or `lint` check, no default).

## Decisions

**D1 — The declaration is a map from source type to required section, and contexture owns neither literal.**
`ingest.required_capture_sections` maps a source type the store uses to the section heading a capture of that
type must carry. Both halves are the store's own vocabulary: the source type is whatever it stamps, and the
heading is whatever its captures use.
*Rationale:* three authoring rules push the same way. A frontmatter key a specification depends on is named in
exactly one place and read from `contexture.yaml` everywhere else; fail-closed language must name what it
fails closed to, "sourced from config, not a hardcoded literal"; and a scenario may not encode one
deployment's vocabulary. Reserving a section name would impose a word on stores that have never heard of this
feature, and reserving a source type would begin refusing ingests for a store already using that word, with no
opt-in and no migration path. Owning neither literal is also what makes the rule general rather than
meeting-shaped: a podcast, interview, or deposition corpus gets the same guarantee with no new code, and that
generality is the test of whether the abstraction is real rather than a rename.
*Alternative considered:* a list of source types, with the section name fixed as a shipped constant. Rejected —
it buys one character of config in exchange for contexture owning a vocabulary word forever, and it is the
version that would have to be widened the first time a store's captures spell the section differently.
*Alternative considered:* a per-source-type object with room to grow (required sections, plus future keys).
Rejected — there is no second key, and a one-key object is a shape whose only purpose is anticipating one.

**D2 — The gate is a refusal at `ctxr ingest`, not at capture time and not at `source check`.**
*Rationale:* ingest is already the command that refuses a capture on a precondition — it refuses one that
already carries a source hash, writing nothing — so this is the established gate on the established command
rather than a new kind of enforcement. It is also the exact moment the claim matters: ingest is where a hash is
frozen and where a note starts citing the capture as its provenance. Before that point nothing has been
asserted; after it, the assertion is in the store.
*Alternative considered:* refuse at `ctxr source check`, so an agent learns one step earlier. Rejected —
`source check` answers "have I seen this before", is read for a verdict rather than run as a gate, and giving
it a second unrelated refusal axis would put one rule in two commands. Nothing is lost by learning at ingest:
a refused capture is still in the inbox and still reported by lint.
*Alternative considered:* enforce at capture time. Rejected — there is no capture command to enforce in.
Capture is a plain file write an agent does with its own tools, deliberately, and the compliant outcome of
this rule is often a file that was never written at all, which no checker can inspect.

**D3 — The effective source type is the one the capture will be ingested under, from either source.**
The gate consults the `--source-type` flag and the `source_type` already in the capture's frontmatter, and
applies if either has an entry in the map.
*Rationale:* a capture pipeline commonly writes `source_type` at capture time — the capability the spec
explicitly preserves — so the flag is not the only place the type lives. Consulting only the flag would let a
capture that declares itself one kind be ingested under another name, which turns the store's own declaration
into a suggestion. This is the same instinct as refusing to guess among multiple dedupe matches: where two
sources of truth could disagree, do not silently prefer one.
*Alternative considered:* consult only the flag, since it is what gets stamped. Rejected — it is a one-word
bypass of a rule the store asked for, and it would be discovered by the first person who hit the refusal and
tried a different flag value.

**D4 — The check is shape, and the requirement says what it cannot see.**
It verifies that a section with the declared heading exists and has at least one non-blank line under it.
Whether that content is the complete record is not checked, and the refusal names no length, coverage, or
completeness standard.
*Rationale:* nothing about a capture's bytes distinguishes a full transcript from its first five minutes, so a
check that implied otherwise would be a rubber stamp wearing the costume of a guarantee. The honest split is
the one this spec set already uses for a published page's filing location: the judgment stays in prose because
it is a judgment, and the property that is genuinely derivable from the artifact becomes the requirement.
Stating the limit inside the requirement, rather than leaving it unsaid, is what stops a later reader from
reasonably assuming the check is stronger than it is.

**D5 — What is a requirement here, and what is only a convention.**
The authoring rule is explicit: if the only enforcement is that an agent was told to, it is skill markdown, not
a requirement. Every claim was sorted before any requirement was written.

| Claim | Mechanism | Verdict |
|---|---|---|
| A store may declare required capture sections | `readConfig`'s strict parse accepts or refuses it | requirement |
| A store that declares nothing is unchanged | optional with no default; byte-identical rendered guidance | requirement |
| Ingest refuses a capture missing its declared section, writing nothing | the command exits non-zero | requirement |
| The refusal names the section, not a completeness standard | the error message | requirement |
| The capture guidance states the principle | the rendered section's content | requirement, phrased as what the guidance states |
| An agent fetches the whole record rather than the summary | none — contexture never sees the source | convention |
| The text under the heading really is the whole record | not derivable from the capture | convention |
| A note never cites a derivation-only capture | frontmatter is hand-editable | not a requirement in any form |

The last row is the sentence a reader most wants and the one the project's own rules forbid: never write a
requirement of the form "the agent shall not edit files directly," because it is unenforceable. Its honest
form is the third row — the command refuses — so every requirement below is written about what the command
does, never about the state the store ends up in.
*Rationale:* writing the unenforceable version is the likeliest way this change gets rejected, and it would
also be the requirement most likely to be quietly false in a real store.

**D6 — The guidance goes in the existing capture section, not a new skill.**
`templates/agents/capture-and-ingest.md` already carries the rules a capture write must follow, and every
store reads it every session. The principle is two sentences there, followed by whatever the store declared.
*Rationale:* a skill for this would have to carry a fetch procedure to justify its existence, and the fetch is
precisely what contexture no longer claims to know. Keeping it in the capture section also means the owned
skill set does not move, so no store sees a new file appear for a rule that is three lines long.
*Alternative considered:* a `ctxr-capture-discipline` skill collecting this and the identity rules. Rejected —
it would move prose out of a section every store already loads into a file loaded only when someone thinks to
open it, which is the wrong direction for a rule whose whole failure mode is not being noticed.

**D7 — Optional with no shipped default.**
`readConfig` does a strict parse with no default-merging, so a required key refuses every store that predates
it, and there is no migration mechanism to move one forward. Optional-with-no-default means an existing config
parses untouched, with no version bump.
*Rationale:* the semantics matter as much as the mechanics. `context-store` already names this category — a
key whose absence means the store has not opted into a mechanism, rather than that it accepts a default — and
requires exactly this treatment, so the shape is specified rather than invented here. A shipped default is
also impossible in principle: it would assert that some source type in every store owes a verbatim record,
which is a fact about stores contexture has not looked at.

## Risks / Trade-offs

- **A store declares the key and its captures spell the heading differently.** Every ingest under that type
  then fails until someone notices. → The refusal names the capture and the exact heading it looked for, so
  the fix is legible from the first failure rather than requiring a reading of the config. The alternative —
  matching loosely — would make the check unable to say what it checked.
- **The check can be satisfied by one junk line under the right heading.** → Named in the requirement itself
  (D4) rather than left for a reader to discover, so nobody builds on a guarantee that was never offered. The
  rule this enforces is that the store said which captures owe a record; whether the record is honest is the
  agent's discipline, and no byte-level check can reach it.
- **Two places now read a source type.** The gate reads it from the flag and the frontmatter (D3). → The
  resolution rule is one function with one behavior — if either names a declared type, the gate applies — so
  there is no precedence question to get wrong later.
- **An opt-in rule is a rule most stores will not have on.** → Accepted deliberately. The alternative is
  defaulting it, which enables a mechanism for every store that predates it against source types contexture
  has never seen. A rule that is off until asked for is the correct failure direction for a gate.

## Migration Plan

Additive and opt-in. No schema version bump, no migration, and no change to any command's behavior for a store
that declares nothing. `ctxr update` regenerates the capture section either way; for an undeclared store the
regenerated bytes are identical to today's, which is asserted rather than assumed.
