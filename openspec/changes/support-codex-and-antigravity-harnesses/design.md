## Context

contexture's harness surface is already adapter-shaped. A harness-generation adapter declares a skills directory,
which is bridged to the canonical `.agents/skills/`, and optionally an entry file. The git hooks that actually hold
the write path are harness-agnostic. So "support Codex and Antigravity" could have been two eight-line adapter files.
This change exists because probing both CLIs against real files showed that the adapters are the easy part.

### What was verified, and how

All results come from a scratch git repository holding a 52,424-byte `AGENTS.md` seeded with `SENTINEL-<n>K` markers
at known byte offsets, and one skill reached through a symlinked `.agents/skills`. Each harness was asked, without
tools, to name the highest marker in its loaded instructions and to list its skills.

| Probe | Codex 0.154.0 | Antigravity CLI 1.3.2 | Claude Code (control) |
|---|---|---|---|
| Reads root `AGENTS.md` with no wrapper | yes | yes | via `CLAUDE.md` → `@AGENTS.md` |
| Highest marker seen | `32K` (byte 32,446; `34K` at 34,352 not seen) | `24K` (byte 23,885; `26K` at 25,791 not seen) | `50K` (whole file) |
| Finds a skill through symlinked `.agents/skills` | yes | yes | n/a (bridged) |
| Repo `.codex/config.toml` `project_doc_max_bytes = 65536` honored | no, even with the project trusted via `-c` | — | — |
| Operator-level `-c project_doc_max_bytes=65536` honored | yes (saw `50K`) | — | — |
| `git add` under default sandbox, store root | `.git/index.lock: Read-only file system` | headless: `command` permission auto-denied | — |
| `git add` in a session worktree | `.git/worktrees/<s>/index.lock: Read-only file system` | same | — |
| …with `.git` added to `writable_roots` | still read-only | — | — |

Codex's cut matches its documented `project_doc_max_bytes` default of 32 KiB. Antigravity's matches its documented
rule-file cap of 24,000 bytes (older docs said 12,000 characters). Two downstream stores' current `AGENTS.md` sizes are
50,770 and 35,869 bytes. Both exceed both limits, and the excess sits in the operator's "Store conventions" section,
which renders last.

In the larger store, Codex also listed all 64 skills. It reported that several descriptions were cut off mid-sentence,
which is consistent with its roughly 8,000-character budget for the initial skill list (that store's names and
descriptions total about 15,400 characters).

## Goals / Non-Goals

**Goals:** a store can declare Codex and Antigravity the same way it declares any harness. Each declared harness's
operator learns when that harness is not seeing the whole entry document. The shipped lifecycle skills fail
 check stops misreading the canonical path.

**Non-goals:** see proposal.md. In short: no restructuring of `AGENTS.md`, no emitted sandbox or permission
configuration, no wrapper entry file, no images, and no skill-description budget.

## Decisions

### D1. Adapter ids are `codex` and `antigravity`

The existing ids name the product, not the binary (`claude-code`, not `claude`). Following that, the ids are `codex`
and `antigravity`.

**Case for `agy`:** it is the operator's own word. The second-opinion skill's `CTXR_SECOND_OPINION_AGY_MODEL` and the
downstream store's `antigravity-cli` skill both say "agy", and `--harness agy` is shorter to type.
**Why not:** the adapter describes where *Antigravity* reads skills and rules, and the IDE reads the same `AGENTS.md`
and `.agents/skills/` the CLI does. Naming it for the CLI would imply that the IDE is unsupported. The second-opinion
variable names a *binary it executes*, which is a different register, so there is no inconsistency to fix.
**Case for `openai-codex`:** "codex" alone is a generic word. **Why not:** in an agent-harness picker it is
unambiguous, and the existing ids carry no vendor prefix either (`claude-code`, not `anthropic-claude-code`). No
alias is accepted for either name. The repo's settled rule on root variables (exactly one name, never aliases)
applies in spirit, and an alias list is something every later reader has to reconcile.

### D2. Measure and report the read limit; do not reshape `AGENTS.md` to fit it

**The opposing case, at full strength:** the inlined entry document has outgrown the harnesses that read it. Two of
the four declared harnesses now drop up to half of it, silently and on every turn. A lint finding tells the
operator, but the agent still runs blind until someone trims conventions they wrote on purpose. The structural fix is
also available. Keep `AGENTS.md` to fundamentals, routing, and an index, and move conventions into referenced files
(or, for Antigravity, into `.agents/rules/*.md`, each with its own 24 KB cap). Every harness then loads the parts that
matter and stays under every limit, and the always-loaded context gets cheaper for Claude Code too. 50 KB is about
12k tokens on every session.

**Why it loses here:** it reverses "conventions are inlined rather than referenced". That decision was made because a
referenced convention is one an agent may never open, which is exactly the silent-loss failure this change is
fighting. The rules-directory route helps only Antigravity, since Codex does not read `.agents/rules/`, and it
would duplicate content for a harness that also loads `AGENTS.md`. Both downstream stores are over the limit because
of their *own* convention volume, and trimming is within the operator's control. Codex's limit is also raisable on the
operator's machine. Measuring first is reversible. Restructuring is not.

**What would flip it:** an operator who has already trimmed and still cannot get under 24,000 bytes with a working
store. Or Antigravity or Codex becoming the primary harness for a store whose conventions legitimately run past both
limits. Either reopens D2 as its own change, re-arguing the inlining requirement directly.

### D3. The read limit is an optional field on the existing v2 interface

`resolveAdapter` refuses an adapter whose interface version is not exactly the supported one. Bumping to 3 for an
optional, additive field would refuse every v2 adapter for no reason. The only adapters are built-ins (the `module`
loading path is reserved, not implemented), so no outside adapter can be stranded. The field is optional, absent
means "reads the whole document", and the version stays at 2. The precedent is the v2 bump itself: that one was
justified because `skillsDir` was *required*.

### D4. Emit no sandbox or permission configuration for either harness

**The opposing case:** the store knows its lifecycle needs `git commit`, `git push`, and `gh`. The Claude Code
adapter already has a `permissionConfig` slot, Antigravity reads a workspace `settings.json` with `permissions.allow`,
and generating `command(git …)` allow-rules would make headless Antigravity just work. Leaving it to each operator
means every new machine rediscovers the same failure.

**Why it loses:** for Codex it is impossible from the store. A repo-level `.codex/config.toml` was not honored for
`project_doc_max_bytes`, and `.git` stayed read-only even with `writable_roots` widened. Only operator-level
configuration or an approval escalation unblocks it, and interactive use already gets the escalation prompt. For Antigravity it is possible but wrong. A committed file
granting command execution moves a security posture choice from the operator into the repository, where anyone who
clones it inherits it. `retire-the-write-gate` already moved the Claude Code adapter to emit *no* rules, for the
parallel reason that the store should not try to govern the harness. What the store can do is make the failure
visible and document the operator's settings (README).

**What would flip it:** a harness that reads a project-scoped permission file it treats as untrusted until the
operator approves it. The grant would then stay the operator's, and the store would only propose it.

### D5. The size finding is a lint observation, not a doctor failure

**The opposing case:** the conventions budget is a `doctor` invariant precisely because silent truncation is
unacceptable, and a harness-specific limit is the same failure arriving sooner. A lint finding is easy to ignore.

**Why it loses:** the conventions budget measures something the store fully controls, against a number the store
sets. This check measures the store against a harness *and its operator's local configuration*, which the store
cannot observe. A Codex operator who raised `project_doc_max_bytes` has fixed the problem whether or not they
recorded the override. Under the store-integrity spec's split, a condition the store cannot judge to be broken is an
observation. A doctor failure would also gate CI and automation on a condition unrelated to the commit being checked.
The likeliest response would then be to undeclare the harness, which loses the very visibility this check exists for.
The override (adapters delta) is how an operator who has raised the limit tells the store so.

### D6. Report the section the cut lands in

A byte count alone does not tell an operator what their agent is missing. The finding names the first generated
`contexture:<region>` section containing the byte at the limit. Region boundaries are already fenced in `AGENTS.md`,
so this needs no new markers. When the cut lands outside any fence, the finding names the nearest preceding fence.

### D7. No sandbox-refusal guidance in the shipped skills (dropped during review)

Codex's `workspace-write` sandbox keeps `.git` read-only, even inside a session worktree and even with `.git` added
to `writable_roots`. Headless `codex exec` runs with approvals off, so it fails at the first `git add`. An earlier
draft added skill prose that taught the agent to recognize this refusal, stop, and ask the operator.

**Case for keeping it:** a declined approval prompt produces the same error, and the obvious improvisations
(copying the tree somewhere writable, setting `GIT_DIR`, retrying through another tool) all defeat what the
operator just refused.

**Why it was dropped:** these harnesses are run interactively, where Codex asks the operator to approve each git
step outside the sandbox, and there are no unattended runs. "Do not route around a refused command" is a general
agent rule, not something specific to one harness, and it does not belong in a change about adding harnesses.

**What would reopen it:** an unattended Codex or Antigravity run against a store, or an observed agent
improvising around a declined prompt.

## Risks / Trade-offs

- **The limits will move.** Both are vendor defaults that have changed before (Antigravity went from 12,000 characters
  to 24,000 bytes). → They live in exactly one place each, the adapter. The store override covers an operator ahead
  of a release, and the README records the version each was measured on.
- **The limit is measured on the root `AGENTS.md` alone.** Codex concatenates `AGENTS.md` files from the repo root
  down to the working directory, and a store with nested ones spends the same budget sooner. → The check reports the
  root document, which is the one contexture generates. Nested agent files are operator content outside contexture's
  view, and the README names the interaction.
- **Antigravity IDE versus CLI.** Only the CLI was probed. The IDE is documented to share the rules loader and the
  workspace skills location. → The README states which surface was verified.

## Open Questions

- **Skill-description budget.** Codex truncates descriptions once the listing passes about 8,000 characters. The
  shipped skills use about 4,100 of that. A follow-up could front-load each shipped description's trigger clause, or
  assert a total ceiling in the test suite. It is separable from this change, and its threshold should be measured
  rather than guessed.
