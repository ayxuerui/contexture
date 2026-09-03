## Why

`retire-the-access-axes` removed visibility, disclosure, the scope proposal, and every `--as` flag at schema 8. Four shipped or specified artifacts still instruct an agent to use them.

`harness-portability` requires each contexture-owned skill to "name the command that verifies each step it asks for." `templates/skills/ctxr-connection-finding.md` names `--as <context>` on `graph query neighbors`, a flag `src/run.ts` does not register; `templates/skills/ctxr-publish.md` offers "everything a named context admits" as a fourth `publish gather` subject and explains a disclosure gate that no longer evaluates anything; `src/core/errors.ts`'s selector-required message still offers `--as`. So the requirement is already false in the shipped package, and an agent following the shipped skill hits a usage error.

One of those references is not template rot but a **live specification scenario** — `harness-portability`'s "Publish keeps the reader's level distinct from the disclosure audience" asserts behavior about a gate that was deleted, and a unit test pins the dead prose in place. A spec asserting a mechanism that does not exist is the failure mode the project's own code/judgment seam exists to prevent: it teaches an agent to rely on a thing that is not there.

Separately, `openspec/config.yaml`'s project context claims "A documented adapter seam allows a ranked/semantic engine later." No such seam was built: `bootstrap-contexture-core` D5 explicitly rejected shipping the adapter contract ahead of a concrete adapter, and `openspec/specs/adapters/spec.md`'s Purpose states the ranked/semantic kind "is out of scope here." What shipped is the stable per-note retrieval record. Under config.yaml's own rule — "If this context and a spec disagree, this context wins and the disagreement is a bug — report it" — this is that bug, reported.

This is the residue pass `generalize-identity-migration-residue` performed for identity, applied to the access axes.

## What Changes

- The connection-finding skill drops the `--as <context>` clause from its `graph query neighbors` step.
- The publish skill drops "everything a named context admits" from its subject list, leaving the three selectors `publish gather` accepts, and rewrites its closing paragraph so the reader's comprehension level stays distinct from what a page may contain — an invariant that survives its vehicle — without naming a gate that no longer evaluates anything.
- `publish gather`'s selector-required error message stops offering `--as`.
- `harness-portability`'s disclosure-audience scenario is rewritten to assert the surviving invariant rather than the retired mechanism.
- A new requirement makes the class of defect mechanically detectable rather than found by reading: every long option a rendered owned skill names alongside a contexture command must resolve against that command's registered option table.
- `openspec/config.yaml`'s retrieval paragraph is corrected to describe what shipped — a stable per-note retrieval record — instead of an adapter seam that was refused.
- **BREAKING**: N/A. No command, config key, or note changes; `ctxr update` rewrites two owned skills in place.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `harness-portability`: the shipped-skills requirement's disclosure-audience scenario is restated against the invariant that outlived the gate, and a new requirement binds every owned skill to the affordances the CLI actually registers.

## Impact

Affected code: `templates/skills/ctxr-connection-finding.md`, `templates/skills/ctxr-publish.md`, `src/core/errors.ts` (`PublishSelectorRequiredError`'s message), `test/unit/skills.test.ts` (which currently asserts the dead `--audience` prose and moves with it), plus a new flag-existence assertion in the same file. Project meta: `openspec/config.yaml`.

Affected stores: `ctxr update` refreshes both owned skills; a store that has locally modified either keeps its copy and is reported, per the existing preservation requirement. No configuration key, no schema version bump, no migration.

## Non-goals

- **Rebasing `isolate-the-portability-test` off the deleted disclosure gate.** Its tasks 4.1 and 4.5 and its `harness-portability` delta require an `evaluateDisclosure` step that exists nowhere in `src/`. A find-replace would leave it asserting a step count nothing produces; deciding what a portability test should exercise instead is a design question, not residue, and it deserves its own argument.
- **Teaching `openspec validate --strict` to catch a delta that references a deleted mechanism.** That is the root cause behind two stale changes, and it is a change to the tooling, not to this store's specs.
- **Reclaiming exit codes 4 and 5.** `retire-the-access-axes` D4 reserved them deliberately; nothing here needs them.
- **Stripping the inert visibility key from note frontmatter.** That change's D3 refused it so removal stays reversible; nothing reads the key.
- **Re-opening whether access control returns.** D5 records the intended direction (owner/editor/viewer roles plus a pattern scan at publish time). This change removes references to machinery that is gone; it decides nothing about what replaces it.
