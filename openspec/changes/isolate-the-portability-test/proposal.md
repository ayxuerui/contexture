## Why

`ctxr verify --portable` does not do what its own help text says. `src/run.ts:594` describes the flag as
"the portability test"; `src/commands/verify.ts:64` receives it as `_flags` and never reads it. Running
`ctxr verify` and `ctxr verify --portable` executes byte-identical code. The flag has never had
behavior.

The property the flag names is instead argued in a doc comment (`verify.ts:50-56`): "nothing here reads
any harness-specific file or env var, so the property under test holds by construction." That argument
is currently true — `grep -rn "homedir\|process\.env" src/` returns nothing outside `src/core/env.ts` —
but this spec's own authoring rule says a requirement that claims something is enforced must name the
mechanism that enforces it, and a comment asserting an invariant is exactly the thing that decays. It
is also incomplete: `verify` exercises the working tree, including uncommitted edits, while the claim a
portability test needs to support is "someone can clone this store and drive it."

Downstream evidence that the comment-shaped version is not enough: a store using contexture carried a
114-line `verify_harness.sh` that built a disposable worktree and a fake `$HOME` to test this same
property, and that script had been silently exiting non-zero for two days — its skill-lookup check
grepped `AGENTS.md` for an index that `inline-conventions-and-mission` removed. Its other five checks
were either already subsumed by `ctxr verify` or could not fail (`grep -q "."` on any output; `ctxr
lint`, which always exits 0 by spec). The store is deleting the script. What it should be able to run
instead is a portability test that actually isolates.

Two smaller gaps surface alongside it. The "Executable portability test" requirement still says a skill
is followed "via the `AGENTS.md` index" — that index no longer exists. And nothing in contexture
verifies that the tooling its own owned skills depend on is present: `ctxr-submit` and `ctxr-land`
drive `gh pr create` / `gh pr merge`, so a machine without `gh` gets its first signal after `git push`
has already run, leaving a pushed branch and no pull request.

## What Changes

- `ctxr verify --portable` gains real isolation: it verifies the recorded commit in a disposable
  worktree, in a child process whose environment has the harness home and store-root variables
  removed, and reports which commit it verified. Bare `ctxr verify` keeps today's in-process
  working-tree semantics.
- `verify` gains two operations: a disclosure-gate evaluation (the gate is a core store operation and
  nothing in the portability test exercised it), and a check that the write path's required external
  tooling is present.
- The "Executable portability test" requirement stops asserting the no-harness-state property and names
  the mechanism that produces it. Its stale "via the `AGENTS.md` index" phrasing becomes "by path".
- A source-level test pins the invariant the in-process argument rests on: outside `src/core/env.ts`,
  no module reads `process.env`, and the child-process spawn sites stay enumerated.

## Capabilities

### Modified Capabilities

- `harness-portability`: the portability test's isolation becomes a named mechanism rather than an
  asserted property; its exercised-operation minimum grows by the disclosure gate and the write path's
  tooling prerequisites; its skill-following clause stops referencing the removed index.

## Impact

Affected code: `src/commands/verify.ts` (isolation branch, two new steps, `'skip'` added to
`VerifyStepResult['status']`), a new `src/core/harness/isolated-run.ts` (the sole spawn site for a
re-executed `ctxr`), `src/core/git/repo.ts` (worktree add/remove already present, used as-is), and
`test/unit/single-source-literals.test.ts`.

Affected stores: none. No configuration key is added, no store file changes, and bare `ctxr verify`
behaves exactly as it does today. The `verify --json` envelope gains a `'skip'` status value and a
commit field — additive, per cli-contract's stability requirement.

No dependency changes.

## Non-goals

- **A configuration block declaring external tools** (`environment.requires` or similar). Contexture
  today never lets a string from `contexture.yaml` reach a process spawn or a PATH probe, and
  `contexture.yaml` is a tracked file in a repo that gets cloned and whose pull requests get merged.
  Introducing a store-declared tool name is a new trust boundary for one consumer's benefit, and a
  store-declared *smoke command* would make `git clone && ctxr doctor` arbitrary code execution, since
  `doctor` is what the pre-commit hook runs. The `gh` check added here resolves a name this codebase
  hardcodes.
- **Executing any tool to check it.** Presence is resolved on `PATH`; nothing is run. In particular no
  `gh auth status`: authentication is per-session credential state rather than a property of the store,
  and probing it would make a verification command network-dependent.
- **Installing anything.** Contexture reports what is missing and names it. Choosing `npm install -g`
  as the installer would be a guess about the machine (nvm, volta, asdf, Homebrew, a root-owned
  prefix), it would mutate state outside the store root that no contexture command can reconcile, and
  every other write contexture makes is idempotent and store-local.
- **Writing outside the store root.** Materializing a third-party tool's config into `$HOME` is what
  the downstream script did; adopting it would destroy an invariant currently provable by one grep, and
  two stores on one machine would silently fight over the same destination.
- **A retrieval-quality assertion** (query X returns document Y). That is the `retrieval-quality`
  capability proposed in `retrieval-legs-hardening`, measured against a gold-annotated fixture corpus.
  A single hardcoded query/result pair in the portability test rots the way the downstream script's
  fixtures rotted twice.
- **Making bare `ctxr verify` isolated.** The in-process path stays fast and working-tree-scoped on
  purpose; isolation costs a worktree and a subprocess, which is why it stays behind the flag.
