## Why

Every store now runs the same send-copy rule (`send-copies-beside-their-page`, 0.27.0): a `.pdf`, `.docx`,
`.xlsx` or `.pptx` built from a note sits beside its page's `index.html`, its name led by the date it was
made, and is never overwritten — a new send adds a new dated file. An audit of all three downstream stores
on 2026-10-22 found them compliant: 59 pages, 16 send copies, every one dated.

But only one half of that rule is checked, and only when somebody asks. `send-copy-name` runs inside
`ctxr publish check <page>`, which an agent runs on the page it is working on; nothing checks a store as a
whole, and nothing at all checks "never overwritten". A store stays compliant only while every agent in it
follows the skill. The stores differ in which agents and skills they run — pkm has its own PDF pipeline,
readyrun-brain and bambi do not — so the one place a rule reaches all of them equally is the gate contexture
installs in every store: the pre-commit hook.

## What Changes

- **The pre-commit gate refuses a commit that breaks the send-copy rule.** A new staged check,
  `staged.send_copies`, fails when a commit adds a send copy whose name is not led by a real date
  (`staged.send_copies.undated`), or changes the content of a send copy already committed
  (`staged.send_copies.modified`) — whether in place or as part of a rename. A pure move (a rename with
  identical bytes) and a deletion stay allowed: a store reorganising its pages, or removing one, moves or
  removes its send copies with it. The refusal names the file and says to write a new dated file instead.
- **Lint reports a store's undated send copies.** A new store-scope observation,
  `organize.send_copy_name`, lists every send copy whose name is not dated — the backlog view, in the
  same shape as the existing page-representation and disposable-page reports. Lint reports and never
  fails a build.
- **One reading of "send copy".** `publish check`, the staged check and the lint report read send copies
  through one shared function, so the three cannot disagree on what a send copy is or whether its name is
  dated.
- **The publish skill names the gate.** `ctxr-publish` says the commit is refused for an undated or changed
  send copy, so an agent meets the rule before the hook does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `write-lifecycle`: the pre-commit validation gains the send-copy check, with its own requirement for what
  it refuses and what it allows.
- `context-organize`: lint gains a report of send copies without a dated name.
- `harness-portability`: the publish skill's send-copy requirement adds that the commit gate enforces it.

## Non-goals

- **No check on where an office file sits.** A hand-edited workbook beside its note is legitimate (pkm's FMV
  model, readyrun-brain's broker operating model), and only its author knows whether a file is a source or a
  send copy. A location check would either miss real cases or flag valid ones; the skill rule and review stay
  the gate for that.
- **No refusal of a deleted send copy.** Removing a page — a disposable page past its window, through the
  organize audit — removes its send copies too. Refusing deletion would block that, for a case (deleting
  what was sent) that review shows plainly.
- **No exemption flag.** A copy committed and then corrected before it was sent still counts as changed; the
  fix is a new file name. The hook's `--no-verify` remains the operator's escape, as for every pre-commit
  check — the project asserts only that nothing reaches the default branch ungated.
- **No change to `publish check`.** It already checks the name per page; it only switches to the shared
  reading.

## Impact

- `src/core/publish/send-copies.ts`: gains the page-root listing and the name check, moved out of
  `src/commands/publish-check.ts`.
- `src/core/git/staged.ts`, `src/core/checks/types.ts`: a staged rename carries its similarity score, so a
  rename that changed bytes is told apart from a pure move.
- `src/core/checks/write-lifecycle-checks.ts`: the staged check. `src/core/checks/organize-checks.ts`: the
  lint report.
- `templates/skills/ctxr-publish.md`: one paragraph.
- Stores: no schema change and no migration. All three stores pass today; the gate applies to commits made
  after a store's CLI is updated.
