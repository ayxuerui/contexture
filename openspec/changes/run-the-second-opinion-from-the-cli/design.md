## Context

`templates/skills/ctxr-second-opinion/run.mjs` (542 lines, Node standard library only) does everything mechanical about a second opinion:
- the preflight;
- the concurrent fan-out to `claude -p --tools ""`, `codex exec --sandbox read-only` and `agy -p --sandbox`, each in a fresh scratch directory;
- the timeouts;
- anonymised letters and the manifest;
- the blind check and the quorum.

The prompt fragments sit beside it. The skill invokes it with `node __SKILLS_PATH__/ctxr-second-opinion/run.mjs`.

The runner reports two statuses of its own, 2 for a partial result and 1 for a usage error, which differ from ctxr's exit-code table.

The runner passes its whole environment to every model CLI (`childEnv()` copies `process.env`). On a laptop that is the operator's own shell. In the `serve` container of a deployed store, it would include `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE`, and the key is mounted at `/run/secrets/github-app-key`.

## Goals / Non-Goals

**Goals:**
- One runner, reachable by the skill, by any harness without the skill, and by the MCP surface.
- Behaviour identical to `run.mjs`, apart from the exit-code mapping and the environment allowlist.

**Non-Goals:**
- Any change to the critique protocol: the roles, the letters, blindness and quorum all stay as they are.

## Decisions

### D1. The runner becomes a `ctxr` command group: the one command that invokes a model CLI

**The case for keeping the script** (archived D1 of `2026-10-05-ship-a-cross-model-second-opinion-skill`, steelmanned):
- **The seam.** The code/judgment seam puts reading and synthesis in skills, and the runner serves only that synthesis.
- **Flag drift.** A command binds vendor CLI names and flags into the CLI contract, and those flags drifted three times in pkm's history.
- **A clean rule.** "No `ctxr` command invokes a model" is a crisp property, and the CLI's determinism argument rests on it.

**Why it no longer holds:**
- **A second caller exists.** The MCP surface needs the runner and cannot reach a store's skill directory as an executable entry point. A second copy would drift. The premise "meaning to no other caller" is gone.
- **Flag drift is unchanged by the move.** The vendor flags were always code contexture releases. They stay internal to `src/core/second-opinion/`, behind contexture's own options (`--tier`, `--only`). The preflight keeps checking each CLI's help text for them, so a drifted flag still fails loudly. The CLI contract records only contexture's options and exit codes.
- **The rule survives as an exception.** The crisp property becomes "exactly one command invokes a model CLI, it is never on the write path, and nothing else depends on it". The scenario "No command depends on the model CLIs" stays and is still tested. Determinism was never claimed for a second opinion.

**Group name:** `second-opinion` matches the skill (`ctxr-second-opinion`), which now does drive a command group of that name. The skill-naming contract that D11 relied on now holds in the other direction.

**Subcommands:** `preflight`, `critique` and `poll`, rather than a `--mode` flag, because each takes different required inputs.

### D2. Exit codes follow the shared table

| Outcome | Exit code |
|---|---|
| Success | `0` |
| Usage error, or fewer than two CLIs requested | `2` (Usage) |
| Partial result (fewer than two valid answers) | `3` (CheckFailed): the command ran and found the second opinion incomplete |
| A preflight with a failing CLI | `3` |

No new code is allocated. The skill text names the statuses by meaning.

### D3. The model CLIs get an allowlisted environment

The child environment is built from an allowlist instead of copying `process.env`:
- `PATH` (with the user-install directories appended, as now), `HOME`, `USER`, `LANG`, `LC_*`, `TERM` and `TMPDIR`;
- `ANTHROPIC_*`, `CLAUDE_*`, `OPENAI_*`, `CODEX_*`, `GEMINI_*`, `GOOGLE_*` and `AGY_*`, the variables the CLIs themselves read for login, configuration or proxies;
- `CTXR_SECOND_OPINION_*`.

Everything else is dropped. In particular that covers `GH_*`, `GITHUB_*`, `CONTEXTURE_*` (including `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE`), and anything that merely ends in `_TOKEN`, `_KEY` or `_SECRET` without one of the allowed prefixes.

**What this does not do: it is not a sandbox.** Codex's read-only sandbox can still read any file the process can read, and agy can act. The environment allowlist removes the pointers to secrets, not the secrets. Where a secret is mounted as a file, the boundary is the machine the command runs on. The skill already says that agy contains an accident and not an attack. The MCP change therefore runs this command only where no approval credential is mounted (see that change's D10).

**Opposing case (keep the whole environment):** some CLI configurations rely on variables nobody anticipated, such as a corporate proxy or a custom config directory. The allowlist could break a working setup silently. The mitigations:
- `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` and `NODE_EXTRA_CA_CERTS` join the allowlist.
- `CTXR_SECOND_OPINION_PASS_ENV` names any further variables to pass through. The protected prefixes `GH_`, `GITHUB_` and `CONTEXTURE_` take precedence over it. Naming one of them makes the command exit with the usage code before any CLI launches, so the guarantee cannot be configured away. A variable an operator does pass through is that operator's own responsibility.
- A preflight failure prints the dropped variable names (names only, never values).

### D4. Prompts are package templates; the skill loses its supporting files

`critic-contract.md`, `lenses.md` and `personas/*.md` move to `templates/second-opinion/` and are read through `packagedTemplate`.

The skill's supporting files become empty. `ctxr update` already removes managed files a release no longer ships (`src/core/skills.ts`, the managed-file prune), so stores lose `run.mjs` on update.

**A store on an older CLI keeps its old script working.** This is the older-CLI-prunes-newer-skills hazard run in reverse, and is harmless: the old skill text and the old runner stay together until that store updates.

## Risks / Trade-offs

- **A store updates its skills but runs an older global `ctxr`** (the skill names a command the binary lacks). → `ctxr update` writes skills from the running binary, so new skill text arrives only from a binary that has the command.
- **Ported behaviour diverges from `run.mjs`.** → Every stub-CLI scenario of `run.mjs` is ported to the command's test suite (task 1.2). A dual run against the old script was dropped after critique: its argument shape and exit codes differ, so a shim would exist only to be deleted.
- **The allowlist drops a variable a CLI needs.** → The pass-through variable and the preflight's dropped-names report (see D3).

## Migration Plan

1. **Release.** The command and the reworded skill ship together.
2. **Each store gets it with its next `ctxr update`**, through the normal propagation chain.
3. **Rollback** is the previous release, whose `ctxr update` restores `run.mjs`.

## Revisions after critique

A three-model critique on 2026-10-23 approved this change with changes from all three reviewers. These revisions override anything inconsistent above.

1. **Protected prefixes take precedence over the pass-through variable**, which cannot name `GH_`, `GITHUB_` or `CONTEXTURE_` variables. This is now tested.
2. **The tests are ported straight to the command.** The dual run against `run.mjs` is dropped: different arguments and exit codes made it a throwaway shim, and moving the prompts would have broken it anyway.
3. **Task 2.1 names `src/core/skills.ts`** as where the supporting files are dropped.
