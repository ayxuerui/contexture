## Context

See proposal.md, Why. Current state:

- **The command.** `ctxr second-opinion` (`src/core/second-opinion/`) spawns `claude`, `codex` and `agy` with no shell, in an empty scratch directory, with an allowlisted environment (`environment.ts`). It writes its answers to an output directory and prints only letters and statuses.
- **The MCP runner.** `ctxr` and `ctxr_write` (`src/core/mcp/tools/cli.ts`) spawn the server's own CLI with a 30-second bound (`CLI_TIMEOUT_MS`), 256 KiB per stream, and no stdin. `input`/`@input` exists only on `ctxr_write`, written under a session's cache path.
- **The serve container** (contexture-images `runtime/compose.yaml`):
  - It installs no harness (`HARNESSES: ""`).
  - It has 512 MB and one CPU.
  - It holds the approval App key at `/run/secrets/github-app-key`.
- **D10 of `serve-the-session-lifecycle-to-chat-apps`** deferred this until a per-job sandbox or a vendor-API backend existed.
- **Each CLI's real config folder** (`~/.claude`, `~/.codex`, `~/.gemini/antigravity-cli`) holds its login beside every past conversation.

## Goals / Non-Goals

**Goals:**
- **Each model CLI sees only its own folder,** enforced by the kernel where it can be, in a shell and on the server.
- **Same command over MCP.** `second-opinion` through the store's server is the CLI command, run by the same code with the same options, environment allowlist and exit codes. It is one core, as for every other `ctxr` tool command.
- **The plugin gains the skill as a shared skill,** with no second text.

**Non-Goals:**
- **Confinement on macOS** (no Landlock): it is reported, not provided.
- **Answers that outlive the call.** There is no job store and no result tool.

## Decisions

### D1. Every run is confined to a fresh home of its own, in the CLI and on the server

The command, not the MCP layer, confines each model CLI, so a laptop and the server run the same code. For each CLI in each run:

1. **A fresh temp folder** becomes both `HOME` and the working directory. It replaces today's scratch directory.
2. **Only that CLI's login file is copied in.** The declared list lives in `lineup.ts`:
   - `claude`: `.claude/.credentials.json`
   - `codex`: `.codex/auth.json`
   - `agy`: `.gemini/antigravity-cli/antigravity-oauth-token`
3. **The run is wrapped in `setpriv --landlock-access fs` with rules allowing:**
   - read and execute on the system directories (`/usr`, `/lib`, `/bin`, `/sbin`), `/proc`, a declared handful of files under `/etc` (TLS roots, resolver, hosts, passwd, localtime) and the CLI's resolved install directory;
   - read and write on the folder.

   Nothing else is reachable: not the store, not `/run/secrets`, not the rest of the real home.
4. **Afterwards**, a login file that changed in the folder is copied back over the original, if the original is unchanged since it was copied in. Codex rotates its refresh token, and losing the rotated one breaks the real login. Then the folder is removed.
5. **The critic contract** also tells each critic that its folder is all it may use. That is a second layer for an honest model, not the boundary.

**Measured on 2026-11-11:**
- **On this host,** all three CLIs answered a ping from a fresh home holding only their login file, under Landlock rules of this shape.
- **Codex was told to read a file outside its folder** and could not. Its own shell sandbox (bubblewrap) failed to start, so it had no file access at all.
- **agy, headless,** denied its own read before Landlock was reached.
- **In serve's image** (`contexture-runtime:1.0.0`, Debian trixie, util-linux 2.41.5), `setpriv` applied Landlock as the unprivileged serve user under Docker's default seccomp: `/etc/passwd` and `/home` were denied, and the folder was writable.
- **User namespaces were refused there** (`unshare: Operation not permitted`) unless seccomp was turned off.

**Where it cannot confine:** the run keeps today's behaviour, with the real `HOME` and a scratch working directory, and `preflight` reports `confined: no` with the reason. This covers macOS, which has no Landlock, util-linux before 2.40 (this host's Ubuntu has 2.39), and kernels without Landlock. A macOS Claude login lives in the Keychain, not a file, so seeding would not work there anyway. The server adds `--require-confinement` to every `second-opinion` command it runs; with it, the command exits with the failed-check code before starting a model CLI when it cannot confine. The check lives in the command because only the command may import the second-opinion modules (an existing test), so the server does not detect Landlock itself.

**This supersedes D10** by taking its "one sandbox per job" option, with a folder and Landlock in place of a uid of its own. The README's rule that nothing an agent can steer reads the approval key still holds.

**Opposing case: the plain route, the CLIs run as a shell does with no confinement.** It needs no wrapper, no seeding and no copy-back, works the same on every OS, and the operator's audience is people they already trust.
- **Why not:** a plan pasted from an email or a web page carries its author's instructions, not the member's. Unconfined, Codex and agy can read the App key the whole approval design rests on.
- **What it costs:** confinement is a few dozen lines around the existing spawn, with a binary the image already ships. Unconfined, the cost is one injected sentence away.
- **What it buys a laptop too:** confined, a run there no longer reaches SSH keys or every past conversation in `~/.claude` and `~/.codex`.

**Opposing case: bubblewrap,** which can remap paths, so the real login files would be bound in rather than copied.
- **Why not:** it needs user namespaces, which Docker's default seccomp profile refuses, as measured above. Loosening seccomp for serve trades one exposure for another.
- **What copying costs instead:** one copy-back rule.

**What stays exposed:** each CLI can read its own login file in its folder. Claude runs with no tools; confined Codex could not start its shell; agy headless denies reads unless settings allow them. The skill's advice to leave agy out for a plan someone else wrote stays.

### D2. `--print` is a CLI option, and the server always adds it

The answers have to reach the chat. Over MCP the member cannot read the server's output directory, and leaving members' plans in the server's temp directory is a leak of its own. So `critique` and `poll` gain `--print`:
- **What it prints.** The texts go on stdout and no directory is written. A critique's letters come first and the letter-to-role table last.
- **Where it applies.** `ctxr` adds the option itself, and a member's `--out` is refused. In a shell it is useful as it stands: piping a poll into a note, for one.

**Opposing case:** let MCP read the output directory and return the files, so the CLI is unchanged. That puts a second-opinion-shaped result renderer in the MCP layer, which is exactly the "MCP-only coarse tool" the alignment rule forbids. It also still leaves the files on disk until something removes them.

**Trade-off accepted:** the skill's "synthesize on the letters before opening the manifest" becomes an ordering within one output, not two reads. The table is printed last and the skill says to stop reading at it until the synthesis is written, which is weaker than a separate file. The bias it guards against is mild and the skill names it in the report either way.

### D3. One blocking call with its own bound

- **The bounds.** The runner's bound for `second-opinion` is 240 s, against 30 s for everything else. The server passes `--timeout 200` per CLI, unless a smaller one is given, and refuses a larger one. 200 s leaves 40 s for spawn and output handling.
- **Why 240 s.** claude.ai and Claude Desktop are documented at 300 s, with users reporting a hard cutoff at about 240 s. The default-tier critique is measured at one to two minutes.
- **The failure mode.** A critic slower than 200 s is a failed critic in a partial result. The call itself is never killed by the client's time limit with nothing returned.

**Opposing case:** start-and-fetch tools, a job id, then a result call. They survive any client limit, including Claude Code's reported 60-second drops and maximum-effort runs of eight minutes. They cost a job table, a result lifetime, ownership checks on fetch, and a second tool the CLI has no counterpart for. Nothing yet shows a default-tier run missing 240 s, so the simpler call goes first. If timeouts appear in real use (tasks 6), start-and-fetch is the next change.

### D4. One second opinion per server at a time

- **The guard.** A module-level flag in the `ctxr` tool refuses a second `second-opinion` call while one runs, with `mcp.busy` and a message to retry in a few minutes. `preflight` counts too: it starts the same CLIs.
- **Why.** Three model CLIs are three Node or native processes of a few hundred MB each. Two runs at once would need roughly twice the container's raised memory, and a kill by the memory limit would take serve, and with it every member's connection, down.
- **Opposing case: a queue,** so the second member waits instead of retrying. A queued call still has to finish inside the client's time limit, and two back-to-back critiques do not fit in 240 s. Refusing with a reason is honest and needs no state.

### D5. `input` on `ctxr` for `second-opinion` only

- **How it works.** The `@input` substitution `ctxr_write` uses is reused. The file goes in a fresh temp directory outside any checkout, since `ctxr` may run against the served commit with no session, and is removed after the run.
- **Where it is refused.** Every other `ctxr` command refuses `input`, so the read-only tool gains no general way to put text on the server's disk.
- **What it reads.** `--plan-file` and `--prompt-file` stay the only path options; any other path argument is checked as today.

### D6. The skill is one text for both surfaces

`ctxr-second-opinion` joins `MCP_SKILL_FILES` and gets the shared opening section. Its shell-only passages are reworded to hold on both surfaces, under the existing drift check, which reads the server's allowlist:
- **The plan.** "Write the plan to a file" becomes "write the plan; through the store's server it goes as `input` with `@input` as the `--plan-file`".
- **`--out` and the output files.** In a shell they are as today. Through the server the answers arrive in the result.
- **Environment variables** (`CTXR_SECOND_OPINION_*`, `PASS_ENV`) are the operator's to set on the server. A member asks the operator rather than setting them.
- **Background runs and raised timeouts** stay shell-only, and say so at the step.
- **Signing in.** Through the server, a CLI reported down means the store's operator must sign it in.

`/contexture:second-opinion` is added to `PLUGIN_COMMANDS`. Per the command-contract rule, the skill's name already drives the `ctxr second-opinion` group, so the command name matches.

## Risks / Trade-offs

- **[A critic quotes the App key or another member's files back to a member]** → Landlock denies the read (D1). The server refuses to run unconfined, and a scenario with a stub CLI that tries to read outside its folder pins it.
- **[A critic quotes its own login token]** → It is the one secret in its folder. Claude has no tools, confined Codex has no shell, and agy headless denies reads. The operator can revoke a provider login from that provider's account page.
- **[A refreshed login is lost]** → It is copied back when the original is unchanged. If both changed (an interactive session refreshed at the same time), the original wins, and the next run seeds from it.
- **[A CLI update needs a path the rules omit]** → `preflight` runs each CLI confined, so it fails before a critique is spent, naming the CLI. The fix is one entry in the declared list.
- **[Serve runs out of memory]** → The paired images PR raises `serve`'s limit, with D4 keeping runs to one. Task 6.1 measures peak memory on the live host before the limit is chosen.
- **[A model CLI's self-update or login refresh writes into serve's home]** → That home is serve's alone and backed up like the others. The daily runtime update already rewrites it.
- **[A client drops the call before 240 s]** (Claude Code's reported 60-second drops) → The member sees a tool error. Task 6.2 records each client's real limit; start-and-fetch is the follow-up if it bites.
- **[The CLIs aren't signed in on a store's server]** → `preflight` reports each as down. The skill tells the member it is the operator's step, and nothing else on the server changes.

## Migration Plan

1. **Release.** Confinement arrives for laptops with the same release, with no setting. contexture releases the change, and the plugin's version moves with it. Until a server runs the release, `ctxr` refuses `second-opinion` as not allowed, and the shared section's "older server" rule covers that.
2. **Images.** The images PR adds the CLIs to `serve` and raises its memory. `setpriv` is already in the image. Stores follow images main, so merging it is the rollout.
3. **Sign-in.** The operator signs in each CLI once per store's `serve` and runs `ctxr second-opinion preflight` there.
4. **Rollback.** Revert the images PR (no CLIs in serve) and remove the allowlist entries in a patch release. If confinement breaks a CLI on laptops, a patch release falls back to the unconfined run, which `preflight` already reports. Nothing in a store changes either way.
