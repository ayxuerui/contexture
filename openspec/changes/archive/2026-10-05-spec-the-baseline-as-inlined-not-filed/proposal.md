## Why

`harness-portability` still requires a contexture-owned baseline convention *file* under the configured
guidance directory — "`init` SHALL write it" — and the shipped code deliberately does the opposite.
Commit 9b81464 ("Render the baseline conventions into AGENTS.md instead of a second tracked file")
renders the baseline straight into the entry document, and `ctxr update` deletes the copy earlier
versions wrote. That commit touched only `src/`, `templates/`, and `test/`, so the requirement added by
`2026-09-02-compose-store-guidance-documents` was never removed from the main spec (issue #57).

A requirement that no longer holds is worse than a missing one. The main specs are the authority for
what contexture guarantees: anyone reading this one to implement, review, or verify the conventions
section will conclude a fresh `init` is broken, or will "restore" a file the tool now actively deletes.

The behavior itself is settled. 9b81464 records why: the baseline was committed twice (the file and its
verbatim inlined copy in `AGENTS.md`, three directories apart), every config change produced a diff in
both, staleness ran across two hops (template → file → `AGENTS.md`), and one tool-owned file sitting
among the operator's own made "do not edit this one, edit that one" a live footgun that fired on a real
user. This change brings the spec to that behavior, and corrects the code comments and the one line of
shipped skill prose that still describe a baseline file. It changes no behavior.

## What Changes

- **REMOVED** from `harness-portability`: "A shipped baseline convention is delivered into the guidance
  directory and refreshed by update", with its reason and migration recorded.
- **ADDED** to `harness-portability`: "The shipped baseline convention is rendered into the entry
  document, not delivered as a file". It re-homes every clause of the removed requirement that still
  holds — rendered from the store's own configuration and never a shipped profile's or one deployment's
  names; refreshed by the update command when the template or configuration changes; byte-stable when
  neither did; operator files in the guidance directory left untouched — and specifies what replaced the
  rest: the baseline opens the conventions section with a provenance line naming contexture rather than a
  path, `ctxr doctor` attributes a baseline-only drift to the baseline by name, and the update command
  removes a managed copy an earlier version wrote while leaving an operator file at the same name alone.
- Code comments in `src/config/defaults.ts`, `src/config/schema.ts`, `src/core/conventions.ts`, and
  `src/core/reconcile.ts` stop describing a baseline file (two still named `syncBaselineConventions`,
  which no longer exists), and `ctxr-session-capture` stops telling an agent to "read that file first":
  it points at the first block of `AGENTS.md`'s "Store conventions" section instead.
- The removed requirement's "discoverable by the same mechanism that scans and inlines every other
  convention document" clause is deliberately **not** carried forward: the baseline is synthesized, not
  scanned, and that is the point of 9b81464.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: one requirement REMOVED and one ADDED, as above. "Operator conventions are
  inlined into the entry document" and "The entry document's inlined content matches its sources" are
  unmodified — both already hold of the shipped behavior as written (see design.md D2).

## Non-goals

- **Changing any behavior or test.** The shipped behavior is correct and already tested
  (`test/unit/conventions.test.ts`, "the baseline renders into AGENTS.md instead of a file"); only the
  spec, some comments, and one skill sentence are behind.
- **Editing `harness-portability`'s template-selection requirement**, whose prose mentions "the baseline
  conventions". It refers to the baseline's *content* directing an agent to a directory's `README.md`,
  which the inlined baseline still does; it asserts no file, so it is correct as written.
- **Restoring the file.** Argued and rejected in design.md D1.

## Impact

- `openspec/specs/harness-portability/spec.md` on archive: one requirement replaced by another. No other
  main spec references the baseline file.
- `src/`: comments only. No configuration key, test, or command behavior changes.
- `templates/skills/ctxr-session-capture.md`: one sentence, reaching stores as a managed-skill refresh
  on their next `ctxr update` after the release that carries it.
