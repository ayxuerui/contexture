# Design

## Context

See proposal.md for why. The relevant state today:

- **The blocking run.** `ctxr second-opinion critique|poll` (`src/core/second-opinion/modes.ts`) runs the three model CLIs and returns when all have answered or timed out. The default per-CLI timeout is 600 s. `--out` writes a folder with `raw/`, the lettered critiques and `manifest.json`. `--print` writes nothing and prints the texts.
- **The server runner.** `secondOpinionTool` (`src/core/mcp/tools/cli.ts`) writes `input` to a temp folder, adds `--print`, `--require-confinement` and `--timeout 200`, and runs the CLI with a 240 s bound. The JSON body goes out only when the run ends. A module-level `secondOpinionRunning` flag is the one-at-a-time lock. It is cleared in `finally`, when the CLI exits, not when the HTTP call drops.
- **The measured cut.** Calls through brain.ruixue.ai are dropped 125 s after they reach serve. On 2026-11-14 and 2026-11-15 this held for five calls out of five. The tunnel logs the request as "ended abruptly: context canceled". Live critiques took about 130 to 145 s. The busy refusal the operator saw came 3 s after one of those cuts, while that run was still going.

## Goals / Non-Goals

**Goals:**

- Every `ctxr` tool call for a second opinion returns in about 90 s or less, whatever the run takes.
- One skill text for the shell and the server. The steps are the same and only the transport differs.
- A busy refusal leads to the answers instead of a lost run.

**Non-Goals:** as listed in proposal.md (no streaming, no queue, no restart survival, no detached preflight).

## Decisions

### D1. Detach on the existing commands, plus one `result` command

`critique` and `poll` gain `--detach`. `ctxr second-opinion result <run> [--wait N]` fetches the run.

- **Why a flag, not a `start` subcommand.** Every option of `critique` and `poll` (`--tier`, `--only`, `--timeout`, the input flags) applies unchanged, so the start step and the blocking form cannot drift apart. A `start critique` subcommand would duplicate the option table.
- **Opposing case: `start`/`result` as a separate pair, sharing nothing with the blocking commands.** That reads more clearly as a job API and leaves the blocking commands untouched. But it doubles the command surface, and two ways to say `--tier` is exactly the drift this change exists to avoid. The flag wins.

### D2. The run folder is the job, and it records what the run printed

A detached run gets a folder at `<tmpdir>/ctxr-second-opinion-runs-<uid>/<run>/`. The parent is created with mode 0700, and its owner is checked on every use. The folder holds:

- `input.md`: the plan or prompt, mode 0600.
- `run.json`: mode, owner (on the server), start time, the child's pid and its start time, the lineup read at start, the child's argv, and a stop time once the run is found stopped.
- `result.json`, written by the child when it ends: its exit code, its printed output and its `--json` data, which hold the manifest and the texts. A refusal or crash in the child is recorded there too.
- `stdout.log` and `stderr.log`: the child's own output, for diagnosis only.

The run id is 128 random bits in base32 (26 characters). It names the folder.

- **How `result` renders.** The child runs with `--print`, and `result` replays the output and exit code that run recorded. A fetched run and a blocking printed run therefore cannot differ. This replaces the first draft's plan to write the `--out` layout and render it again: replaying needs no second renderer to keep in step.
- **Opposing case: run folders under the store's `.contexture/cache/`.** That keeps everything under the store. But on the server the store root is the served view, which `sync` moves and resets. A run must outlive a sync, and the server's earlier D2 was to leave nothing in a checkout. A temp directory with a per-user parent serves both surfaces the same way.

### D3. The detached child is the CLI itself, with an internal run-folder argument

`--detach` validates everything, creates the folder, then spawns `process.execPath` with this CLI's own entry, the caller's options, the input as the folder's `input.md`, `--print`, and a hidden `--run-folder <dir>`. The child runs detached and unref'd, in a process group of its own, with stdout and stderr going to files in the folder. It runs on the lineup recorded in `run.json` and opens no store. When it ends, it writes `result.json` and releases the lock.

The child is the same code path as a blocking `--print` run, so confinement, the environment allowlist and the lineup are not re-implemented. `--run-folder` is internal: it is hidden from `--help`, and the server's argument check refuses it.

- **Opposing case: run the critique in-process on the server, with no child.** That is simpler on the server. But the CLI would then need a different mechanism, which breaks the mirror. In-process runs would also share serve's event loop with three model CLIs' output parsing.

### D4. The lock is "a running run in my runs folder", not a module flag

Starting a detached run takes an exclusive create of `<runs>/.lock`, holding the pid. The lock is checked by testing whether that pid is alive, and a dead pid's lock is taken over.

- **Before taking the lock**, the start step sweeps: a folder whose pid is dead and has no finish time is marked stopped, and folders older than one hour past their finish or stop time are removed.
- **A busy refusal** reads the running run's id from the lock. On the server it names the id only to that run's owner (D5).
- **Why the same lock in a shell.** It is the mirror the operator asked for, and three model CLIs at once are a machine-wide cost on a laptop too. A blocking run in a shell does not take the lock, as today.
- **Opposing case: keep the in-memory flag on the server, and no lock in a shell.** The flag is exactly what ties the lock to an HTTP call's lifetime. It also would not see a run started by another serve process or by a shell on the same host.

### D5. Ownership on the server is the member's email, stamped by the runner

The server runner passes the member's email to the child through an internal environment variable that the environment allowlist strips from the model CLIs. The child records it in `run.json`. `result` through the server compares it with the caller's email. A mismatch is reported as "no such run", so a run id leaks nothing.

The shell writes no owner, and a shell user reads every run in their own runs folder. On the server all members share one machine user, which is why ownership exists there.

### D6. The bounds

- **Per call: 100 s.** `result --wait` is capped at 90 s through the server, which leaves 10 s for spawn and output, inside the 125 s cut with 25 s to spare.
- **Per CLI.** `--timeout` defaults to the CLI's 600 s and is capped at 600 s through the server. The 200 s cap existed only to fit one HTTP call.
- **The blocking form through the server** is detach plus `result --wait 90`. Skill copies already in stores keep working for short plans. For long plans they now get a run id instead of a dropped connection.
- **Why 90 s and not closer to 125 s.** The 125 s figure comes from one host's path, and its source (the tunnel's edge or the chat app) is unconfirmed. If another client turns out to be shorter, only the declared bound changes.
- **Opposing case: a lower wait, such as 30 s, so even Claude Code's reported 60 s drops are covered.** That means more calls per critique, at about two minutes a run. If the 60 s drop is measured, lowering the cap is one constant. It is not raised now on a report that has not been measured.

### D7. Exit code for a run still in progress is `0`

`result` on a running run exits `0`. It prints `running: <run> (<n>s)`, and `--json` carries `state: running`.

- **Opposing case: a distinct exit code for "pending".** That is easier for scripts. But it would add a fourth shared code to the CLI contract for one command, and the MCP result's text already carries the state. If a script consumer appears, the `--json` state field serves it.

### D8. The skill drives start-then-fetch on both surfaces

Section 3 (critique) and the poll section become:

1. Start: `ctxr second-opinion critique --plan-file <plan> --detach`. Through the server, `@input` as before.
2. Fetch: `ctxr second-opinion result <run>`, repeated until the run is finished.

**On a busy refusal:** fetch the run it names if that run is yours, or else wait. The sentence about four minutes is replaced with the measured 125 s cut and the 90 s wait. The deep-pass advice ("run it in a shell") is dropped: with a 600 s per-CLI cap the server can run a deep pass too.

## Risks / Trade-offs

- **[Plans and answers sit on the server for up to an hour]** → The folder is 0700 under a per-user parent, outside any checkout, and removed by the sweep. This relaxes the earlier rule that nothing remains after the call, which was what the dropped-call failure cost.
- **[A serve restart or a runtime update kills runs]** → `result` reports `stopped` with the failed-check code (spec), and the sweep clears the lock. A restart happens about once a day, at the runtime update.
- **[A sweep runs only when a command starts]** → An idle server can hold an expired folder until the next second opinion. That is acceptable for an hour-scale lifetime. A timer in serve would put lifetime logic in two places.
- **[pid reuse makes a dead run look alive]** → `run.json` records the process start time beside the pid, and liveness checks both. On Linux the start time is read from `/proc/<pid>/stat`. Elsewhere only the pid is checked, and that weakness is documented.
- **[Agents loop on `result` too eagerly]** → Each call already waits up to 90 s. The skill says to call again, not to sleep and poll.

## Migration Plan

1. Release the CLI with `--detach` and `result`. A shell can use it at once.
2. The server picks it up on its daily runtime update. The serve process loads it only on restart, so restart `ctxr-serve` on each store host after the release. pkm-serve has been running code from 2026-11-13 while newer releases sat on disk.
3. The skill update ships in the same release. Stores' generated skills refresh with `ctxr update`.
4. **Rollback:** reinstall the previous release and restart serve. Run folders left behind are harmless, and the next release's sweep removes them.

## Revisions after critique

A second opinion on the proposal and this design (strong tier) returned three valid critiques, all APPROVE_WITH_CHANGES.

1. **The lock protocol (all three).** Exclusive create alone does not make taking over a stale lock atomic: two starters that both see a dead holder could both win. The protocol is now:
   - **Contents:** the lock names the run id, the holder's pid and the pid's start time.
   - **Take:** an exclusive create.
   - **Take over:** take a second exclusive file, `.lock.reclaim`, as a short mutex (one older than 10 s is stale and removed). Under it, re-read the lock. Remove it only if it still names the same dead holder, then create it again. Otherwise someone else won, so go back to reading it.
   - **Hand over:** the starter holds the lock while it spawns, then rewrites it with the child's pid. While the starter is alive nobody can take it over. A starter that dies between spawn and rewrite leaves a lock that can be reclaimed while the child runs. That window is a few milliseconds, and it is accepted.
   - **Release:** the child removes the lock when it records its result, only if the lock still names its run.
   - **Test:** simultaneous starts against a stale lock launch exactly one run.

   Rejected: flock (A). Node has no portable advisory lock without a native module, and the reclaim mutex gives the same exclusivity.
2. **The skill and serve roll out apart (B).** A refreshed skill could call `result` on a serve that still refuses it, and pkm-serve showed that lag is real. The skill falls back to the blocking form when the server refuses `--detach` or `result` as unknown. The migration restarts serve before stores refresh their skills, and rollback regenerates skills from the previous release.
3. **Order and pid-less folders (B).** The order is sweep, then lock, then folder, then spawn. A folder with no recorded pid becomes stopped after 60 s, and a folder with no record ages out from its creation time.
4. **A restart (B).** A detached child is in its own process group. If serve's service manager leaves it running, its run stays fetchable, because state comes from the child's liveness and not from serve.
5. **Rejected: drop `--detach`, and make `critique` wait 90 s then hand back an id (A).** In a shell that would cut off blocking runs and their `--out` folders. The server's blocking form already answers a short plan in one call.
6. **Rejected: keep ownership in the server runner only (A).** The run's state lives in files the CLI writes. A runner-side map would be a second store of run state. The owner field is null in a shell and costs nothing there.

## Open Questions

- Which link imposes the 125 s cut: Cloudflare's edge or the chat app? This does not change the design, since every call stays under 90 s either way. It decides whether other store hostnames, without a tunnel in front, could take a higher wait.
