## Why

`ctxr init` asks which harnesses the store targets, records the answer as declared adapters, and then
produces nothing a harness reads for it. Issue #56 reported this when the claude-code adapter still
emitted the write gate, so the visible cost was a hook that was not in effect. `retire-the-write-gate`
removed the hook, but the gap is still there, and it now costs more.

- **A fresh Claude Code store has no `CLAUDE.md`.** `ctxr init --harness claude-code --no-input`
  writes `AGENTS.md`, the skills and the `.claude/skills` bridge, but not the adapter's entry file. That
  file's whole job is one `@AGENTS.md` import. Without it, Claude Code loads none of the store's
  conventions, mission or write-path rule at session start. It finds the skills through the bridge and
  nothing that says how to use the store.
- **Re-running `init` no longer repairs it.** The issue says the already-initialized branch fixes the
  store. It did then. Since that branch was reduced to `reconcileStore`, and `reconcileStore` does not
  call the adapter generator, only `ctxr update` and `ctxr adapters generate` write adapter outputs.
  So `init` and `init` on an existing store now agree, but on the wrong answer, and `init` on an
  existing store no longer equals `update`, although its own code comment says it does.
- **A store fresh from `init` is not current.** The first `ctxr update` after `init` reports
  `CLAUDE.md` as changed. `test/unit/update-command.test.ts` asserts exactly that, with a comment
  explaining that init does not run the adapters.
- **Nothing reports the omission.** The entry-file check in `doctor` skips a missing entry file as
  "nothing generated yet", and the README tells the operator to run `ctxr adapters generate` by hand.
  That is an instruction where a missing step should be a missing step. Non-interactive init has no
  reader for it at all: scripts, provisioning, and the container image.

Reproduced on 0.19.0 in a scratch directory. After `init`, the root has no `CLAUDE.md`. A second
`init` leaves it absent. `update` then reports `"changed": ["CLAUDE.md"]`.

## What Changes

- **Adapter generation becomes part of reconciling a store.** `reconcileStore` generates every
  configured harness-generation adapter's outputs, after the entry-document sections and the skills
  bridge. `ctxr update`, `ctxr update --worktree` and `ctxr init` on an existing store all get the
  outputs from that one place. `update` stops making its own separate call.
- **The generator moves from `src/commands/` into `src/core/`.** `reconcileStore` lives in core, and
  core does not import from commands. `ctxr adapters generate` becomes a thin command over the core
  function. Its behavior and output are unchanged. The unused `git` parameter is dropped.
- **A fresh `init` generates adapter outputs and commits them in the bootstrap commit.** Every adapter
  output the generator reports as written is staged with the scaffold and listed in `created`. For
  `claude-code`, that is `CLAUDE.md`. Its permission config emits nothing for a fresh store, so no
  `.claude/settings.json` appears, which matches `ctxr adapters generate` on a fresh store today.
  `--harness none` and `--harness hermes-agent` write no entry file.
- **New invariant: a store fresh from `init` is already current.** An update run immediately after
  `init` reports nothing changed. This is specified and tested as a property of every
  contexture-owned file. It is not limited to adapter outputs, so the next owned file added to one
  path and not the other fails a test.
- **README.** The separate `ctxr adapters generate` step after `init` goes away. Two neighbouring lines
  still describe the retired write gate (`.claude/settings.json` "wiring up the write-gate hook",
  the `hooks/` shim, `adapters write-gate`). They are corrected in the same pass, because they describe
  exactly the files this change does or does not write.

## Non-goals

- **Changing the harness selection of an existing store.** `init` on an initialized store still ignores
  `--harness`. Re-targeting a store is an edit to `contexture.yaml` followed by `update`, as it is
  today. Making `init` a second configuration writer for that case is a different change.
- **Making `doctor` fail on a missing entry file.** After this change, a store can lack its entry file
  only if it was initialized by an earlier release and never updated since, and `update` repairs that.
  Turning "not generated yet" into a failure would also fire on a store mid-way through adopting a
  harness. Revisit if the gap turns up again from another direction.
- **Folding the whole fresh-init path into `reconcileStore`.** Fresh init and reconcile still build
  their file lists separately. Unifying them is attractive, but it changes the bootstrap commit's
  composition beyond this issue. design.md D4 argues it. The new invariant is the guard against the
  two drifting in the meantime.
- **Reporting what `init` on an existing store changed.** Its `created` stays empty and it still
  discards the reconcile's `changed` list, as it does today. `ctxr update` is the command that reports
  changes.
- **Any change to what an adapter renders.** `CLAUDE.md`'s content and the permission config's cleanup
  are exactly as `ctxr adapters generate` produces them now.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `harness-portability`:
  - "The operator declares which harnesses a store targets, at setup" now requires `init` to generate
    each declared harness's adapter outputs into the bootstrap commit. It gains scenarios for a fresh
    Claude Code store, a store with no harness, and re-init converging. "Selecting no harness is valid"
    additionally states that no harness entry file is written.
  - "Contexture-owned skills are copied into the store and refreshed by update" now names adapter
    outputs among what `init` writes, alongside the skills.
  - A new requirement states that a store fresh from `init` is already current.

## Impact

- **Code:**
  - `src/core/reconcile.ts` gains the generation step.
  - A new core module (`src/core/adapter-outputs.ts`) receives `generateAdapterOutputs` from
    `src/commands/adapters-generate.ts`, which becomes a thin command over it.
  - `src/commands/update.ts` drops its own call. Its `changed` list comes entirely from the reconcile.
  - `src/commands/init.ts`: the fresh path calls the generator and stages its written paths.
- **Tests:**
  - `test/unit/update-command.test.ts`: the first update after init reports nothing changed.
  - `test/integration/init-noninteractive.test.ts` and `init-idempotent.test.ts`: entry-file and
    convergence scenarios.
  - `test/integration/adapters-and-entry-doc.test.ts`: the portability case that asserts a session
    worktree has no `CLAUDE.md` must remove it explicitly, because it is now committed (design.md, Risks).
- **Docs:** `README.md` (quick start, init description, on-disk layout, command table).
- **Shipped skills:** none. `ctxr-derived-artifacts` already names `ctxr update` for entry files and
  `ctxr adapters generate` for adapter outputs. Both remain true.
- **Downstream stores** (pkm, readyrun-brain): no action needed. `update` already generated adapter
  outputs before this change, and still does. A store that has its entry file sees no difference, and
  the generator is byte-stable.
