## Why

A store can declare only two harnesses today, `claude-code` and `hermes-agent`. Codex and Antigravity (`agy`) can
already *reach* a store. Both read `AGENTS.md` at the root natively and both discover skills under `.agents/skills/`,
which is the canonical skills path. So the missing adapters are the smaller problem. Testing both CLIs against a probe
repository (codex-cli 0.154.0, agy 1.3.2) showed what actually breaks:

- **Both truncate the entry document silently, and neither warns.** Codex stops reading project docs at exactly
  32,768 bytes (`project_doc_max_bytes`). Antigravity stops reading a rule file at about 24,000 bytes. Claude Code,
  reading the same file through the `@AGENTS.md` import, saw all 52 KB. Real stores already exceed both limits: one
  downstream store's `AGENTS.md` is 50,770 bytes and another's is 35,869. Because the operator's conventions render
  last, they are what gets dropped. In the larger store Codex never sees about 17 KB of conventions, and Antigravity
  sees only the first 6 KB of a 32 KB section. contexture already fails `doctor` when the conventions section exceeds
  its own budget, exactly so content is never lost silently. It says nothing about the much smaller limit the harness
  actually reading the file enforces.
- **A doctor check misreads the canonical path as a branded one.** `skills_path_is_harness_branded` reports any
  declared adapter whose own skills directory equals the configured skills path. An adapter that reads the
  cross-harness location natively would trip it permanently, and the finding would tell the operator to move to the
  path they are already on.

## What Changes

- Ship two built-in skills-only harness-generation adapters, `codex` and `antigravity`. Each declares `.agents/skills/`
  as its skills directory and declares no entry file, because both harnesses read `AGENTS.md` directly. Both can be
  selected at `ctxr init`, interactively and through `--harness`. The `--harness` help text is derived from the
  selectable list rather than hardcoded.
- A harness-generation adapter MAY declare the largest entry document its harness reads in full: 32,768 bytes for
  `codex` and 24,000 bytes for `antigravity`. A store MAY override that number in its own adapter declaration, for
  example an operator who has raised Codex's `project_doc_max_bytes` on their own machine. The new key is optional
  and has no shipped default.
- New lint observation: when `AGENTS.md` is larger than a declared harness's effective read limit, `ctxr lint`
  names that harness, the document's size, the limit, and the first generated section the cut falls inside. It never
  fails a run.
- Fix `skills_path_is_harness_branded` so that an adapter whose declared skills directory *is* the cross-harness
  canonical location is never reported.
- The README documents both harnesses, including the operator-side Codex setting (`project_doc_max_bytes`) that the store
  cannot carry.

## Non-goals

- **Restructuring `AGENTS.md` to fit the smallest harness.** Moving conventions out to referenced files, or into
  `.agents/rules/`, would reverse the requirement that conventions are inlined rather than referenced, for every
  harness, to work around two. Codex does not read `.agents/rules/` at all. design.md D2 argues this both ways and
  names the evidence that would reopen it.
- **Emitting sandbox or permission configuration for either harness.** Codex ignores a repo-level config for the
  settings that matter (verified). An Antigravity allow-rule granting `git` from a committed file is a security
  posture only the operator can choose, and `retire-the-write-gate` already moved the Claude Code adapter to emit no
  rules. design.md D4.
- **Sandbox-refusal guidance in the lifecycle skills.** Headless `codex exec` (approvals off) fails at the first
  `git add` because its sandbox keeps `.git` read-only. Interactive Codex asks the operator to approve each git step
  outside the sandbox, which is how these harnesses are run. With no unattended runs, nothing fails, so this is
  dropped (design.md D7).
- **A `GEMINI.md` or other wrapper entry file for Antigravity.** Antigravity loads `AGENTS.md` and `GEMINI.md` side by
  side, so a wrapper would load the store's fundamentals twice for nothing.
- **Harness container images for Codex or Antigravity.** Both CLIs already ship inside the existing harness image as
  tools. A dedicated runtime image belongs to contexture-images and is a separate decision.
- **Budgeting skill descriptions for Codex's skill listing.** Codex caps its initial skill list at about 8,000
  characters and truncates descriptions past that. It still listed all 64 skills in the larger store, with several
  descriptions cut off. The shipped set is about 4,100 characters. The effect is real but separable; design.md
  records it as an open question.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `adapters`: a harness-generation adapter may declare its harness's entry-document read limit, and a store may
  override it.
- `harness-portability`: Codex and Antigravity become selectable harnesses. The entry document is checked against
  each declared harness's read limit. The branded-path observation stops reporting the canonical location.

## Impact

- `src/adapters/harness/` gains `codex.ts` and `antigravity.ts`. `src/adapters/builtin/index.ts` registers them, and
  `src/adapters/types.ts` gains optional `entryDocumentMaxBytes`. The interface version stays at 2 (design.md D3).
- `src/config/schema.ts`: `AdapterDeclarationSchema` gains optional `entry_document_max_bytes`, with no shipped
  default.
- `src/commands/init.ts` and `src/run.ts`: the selectable list and the derived `--harness` help.
- `src/core/checks/harness-portability-checks.ts`: one new observation check, plus the branded-path fix.
- README: the harness list and a section on Codex and Antigravity.
- No migration. Existing stores keep their declared adapters, and a store gains a new adapter only by declaring it.
