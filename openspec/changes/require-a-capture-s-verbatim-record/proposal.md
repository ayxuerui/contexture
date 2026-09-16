## Why

The capture tier rests on one sentence: "a retained capture is provenance, not regenerable output." A capture
is kept, committed, and cited from the note it informed precisely because it is the record of what arrived —
the thing a later reader can go back to when the note's conclusion is questioned.

A growing class of sources hands an agent a derivation first and the record second, or not at all. Meeting
products lead with an AI summary; the transcript sits behind a separate call, and on some plans behind a
paywall. A summary is a paraphrase produced once, unreproducible, unable to answer a question it was not
asked. A store that captures the summary freezes a source hash over that paraphrase and cites it from a note
as that note's provenance — recording a conclusion with no evidence behind it, in the one tier whose whole
purpose is evidence. Nothing in contexture notices. The capture parses, ingests, retains, and dedupes exactly
like a real one, and the store is quietly worse in a way no command reports.

This is not a gap in fetching. Which source an agent pulls from, how it authenticates, and which call returns
the transcript are facts about the agent's harness, and they change on the vendor's schedule, not the store's.
What belongs to the store is the opposite question, and it is the one contexture is positioned to answer:
given a capture that has arrived, is it the kind of record this store is willing to treat as provenance? That
is a decision about acceptance, made where a hash is frozen and a note starts citing something, and it is the
only part of this that still holds when an agent is not following instructions.

## What Changes

- A store MAY declare, in `contexture.yaml` under `ingest.required_capture_sections`, a map from a source type
  to the section heading a capture of that type must carry. Schema-optional, no shipped default; a store that
  declares nothing is unchanged in every command.
- `ctxr ingest` gains one refusal: a capture whose source type has an entry in that map, and whose markdown
  record carries no non-empty section under the declared heading, is refused — exit non-zero, capture and
  section named, nothing written. The source type is the one the capture will be ingested under, whether it
  arrives on the invocation or already sits in the capture's frontmatter, so a different `--source-type` does
  not route around the store's own declaration.
- The check is shape and says so. Whether the text under that heading is the complete record is not derivable
  from the capture and is not checked; the refusal names no completeness standard.
- The generated "Capturing and ingesting new material" section states the principle and names whatever the
  store has declared, so an agent meets the rule where it already looks rather than discovering it at a
  refusal.

Not breaking: no new command, no schema version bump, no new note type, template, or skill. A store that
declares nothing resolves identical configuration and gets the same verdict from every command it got
yesterday. Its entry document gains the principle, as every store's does when shipped prose changes, and
carries no trace of the mechanism it has not opted into — no empty list, no dangling heading, no blank line
where a declaration would have been.

## Capabilities

### New Capabilities

None. A capture that must carry a particular section is still a capture: it dedupes, stamps, retains, and gets
cited through the machinery that already exists. What is new is one precondition on one command.

### Modified Capabilities

- `context-ingest`: two added requirements — the store's declaration of which captures owe a verbatim record,
  and the precondition `ctxr ingest` enforces when that declaration is present.

Deliberately unmodified, each checked rather than assumed:

- `context-store` already governs this key's shape. Its requirement "Configuration keys that cannot carry a
  shipped default do not get one" covers a key "whose absence is itself meaningful," which is exactly this
  one. Restating it here would be the duplication the authoring rules exist to prevent.
- `context-organize` already reports a refused capture. Its inbox observation is determined by a file's
  location, not by what the file contains, so a capture that ingest turned away is still inbox material and is
  still reported — on the existing rule, with no delta.
- `harness-portability` is untouched because this ships no new skill. The owned-skill set stays at its current
  membership and order.

## Non-goals

- **Fetching anything, or knowing anything about a source.** contexture opens no connection, ships no client,
  reads no credential, and names no vendor. Which product a store pulls from, which call returns its
  transcript, and which plan gates it are facts about the agent's harness that change on a vendor's release
  schedule; a store's knowledge tool has no business tracking them, and taking them on would mean a contexture
  release every time a product renamed a tool.
- **A plugin or adapter kind for sources.** Same reason, one level up: an adapter registry of providers is a
  vendor registry contexture cannot keep current, and the adapters capability's purpose is pluggable *code
  contexture runs*, which is the opposite of what is wanted here.
- **A new owned skill.** A skill for this would have to carry a fetch procedure, and the fetch is exactly what
  contexture does not claim to know. The rule is two sentences of principle in a section every store already
  reads, so it goes there.
- **Judging whether a record is complete.** Nothing about a capture's bytes distinguishes a full transcript
  from its first five minutes. The check tests that the section exists and is non-empty; mislabeled material
  is the same class of problem as a capture pipeline that stamps its own ingested date — outside what a
  checker can see, and the requirement says so rather than implying otherwise.
- **A reserved section name, or a reserved source type.** Both literals belong to the store. Reserving
  `Transcript` would impose a vocabulary on stores that have never heard of this feature and may already use
  that word; reserving a source type would make a specification depend on a value `contexture.yaml` does not
  own. Naming both in config is also what keeps the rule general — a podcast, interview, or deposition corpus
  gets the same guarantee with no new code.
- **A `doctor` check.** `doctor` runs invariant-severity checks, and a store holding a refused capture in its
  inbox is healthy — the capture simply has not been ingested. Failing a store's integrity gate on it would
  make an offline health check depend on how an agent fetched something.
- **A new `lint` check.** `lint` already reports inbox material by location, and a refused capture is inbox
  material. A second finding over the same file would double-report one condition, a split this spec set has
  been careful about elsewhere.
- **Prompting for the key at `init`, or shipping a default.** Defaulting would switch the mechanism on for
  every store that predates it, against source types contexture has never looked at. `init` is the one writer
  of `contexture.yaml`, and a key it wrote from a guess would be indistinguishable from a decision the store
  made.

## Impact

Affected code: `src/config/schema.ts` (an optional map inside `IngestSchema`, schema-optional with no default
— the `organize.mission_path` pattern, whose absence means "has not opted in" rather than "accepts the
default", so a `contexture.yaml` predating it still parses under `readConfig`'s strict `safeParse`);
`src/core/ingest/required-sections.ts` (new — the section-matching rule, the one place it lives);
`src/core/errors.ts` (one class beside `AlreadyIngestedError`); `src/commands/ingest.ts` (one guard beside the
existing already-stamped refusal, before any write); `templates/agents/capture-and-ingest.md` and
`src/core/agents-doc.ts` (the principle, plus `substituteBlock`'s empty-list case so an undeclared store
renders byte-identically).

Affected tests: `test/unit/config-schema.test.ts`, `test/unit/ingest-command.test.ts`,
`test/unit/agents-doc.test.ts`, `test/integration/ingest.test.ts`.

No schema version bump and no migration: the key is optional with no default, and contexture ships no
migration mechanism, so a required key here would refuse every existing store outright.

Affected stores: additive and opt-in. The next `ctxr update` rewrites the capture section as for any shipped
prose edit. A store that declares a source type and has been ingesting derivation-only captures under it sees
the refusal on its next ingest — deliberately, and only after it opts in by declaring the key.
