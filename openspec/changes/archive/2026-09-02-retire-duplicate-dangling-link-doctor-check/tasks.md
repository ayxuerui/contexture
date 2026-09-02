## 1. Narrow the doctor-side check to ambiguous-only

- [x] 1.1 In `src/core/checks/integrity-checks.ts`, rename `graphDanglingLinksCheck` to reflect its
      narrowed scope: id `graph.dangling_links` → `graph.ambiguous_links`, title "The graph has no
      dangling links" → "The graph has no ambiguous links", reporting code `graph.dangling_link` →
      `graph.ambiguous_link`. Filter `graph.dangling` to `reason === 'ambiguous'` before mapping to
      findings; simplify the message template (no longer needs the ternary — every remaining record is
      `ambiguous`).
- [x] 1.2 Update its entry in the `INTEGRITY_CHECKS` array to the renamed export.
- [x] 1.3 Update the check's explanatory comments: keep the "genuine identity collision is NOT re-checked
      here" block (still accurate — collisions remain proof-by-construction, not a doctor check), and
      rewrite the "Shares detection with organize-checks.ts:brokenLinksCheck" comment to describe the
      reason-based split (doctor owns `ambiguous`, lint owns `not_found`) instead of "two ids, one
      condition."

## 2. Narrow the lint-side check to not_found-only

- [x] 2.1 In `src/core/checks/organize-checks.ts`, filter `brokenLinksCheck`'s `graph.dangling` to
      `reason === 'not_found'` before mapping to findings; simplify the message template the same way as
      1.1 (every remaining record is `not_found`). Id, code, and severity are unchanged.
- [x] 2.2 Rewrite the comment above `brokenLinksCheck` to describe the split instead of "two ids, two
      severity lanes, one condition."

## 3. Update tests

- [x] 3.1 In `test/unit/integrity-checks.test.ts`, update the `graphDanglingLinksCheck` describe block for
      the renamed check: severity/id assertions use the new id; the "fails, naming the link" test uses an
      `ambiguous`-reason fixture; add a case asserting the check passes when the graph has only
      `not_found`-reason dangling links (the narrowing's actual behavior change).
- [x] 3.2 In `test/unit/organize-checks.test.ts`, add a case asserting `brokenLinksCheck` does not report
      an `ambiguous`-reason dangling link (existing coverage only exercises `not_found`).
- [x] 3.3 In `test/integration/migrate-and-doctor.test.ts`, update the "doctor --json on a deliberately
      broken store..." test: change its dangling-link fixture from `not_found` to `ambiguous` reason,
      update the assertion to the renamed check id (`graph.ambiguous_links`), and rename the test to match.
      Add a new case confirming `ctxr doctor` passes on a store whose only defect is a `not_found`-reason
      dangling link.
- [x] 3.4 (discovered during apply, confirmed with user) Strengthen the pre-existing "no check id doctor
      treats as a failing invariant is also reported by lint (task 9.4)" test in
      `test/integration/migrate-and-doctor.test.ts`: it only ever compared check *ids*, which is exactly
      the comparison that passed throughout the original double-count (the two checks never shared an
      id). Add a fixture that trips both a `not_found` and an `ambiguous` link, and assert no
      `(subject, target)` pair reported as a doctor failure is also a lint finding — a condition-level
      check, not just an id-level one.

## 4. Verify

- [x] 4.1 Run the full test suite; confirm no other test or source file references the old id
      `graph.dangling_links` or the old export name `graphDanglingLinksCheck` (repo-wide grep, excluding
      other worktrees).
- [x] 4.2 `openspec validate retire-duplicate-dangling-link-doctor-check --strict` passes.
- [x] 4.3 Manually build a fixture store with one `not_found` dangling link and nothing else wrong:
      confirm `ctxr lint` reports it as `organize.broken_link` (info, exit 0) and `ctxr doctor` exits 0
      with no failing check.
- [x] 4.4 Manually build a fixture store with one `ambiguous` dangling link (two notes sharing a
      basename, one linked by an unqualified name) and nothing else wrong: confirm `ctxr lint` does NOT
      report it, and `ctxr doctor --json` fails with a `graph.ambiguous_links` entry.
