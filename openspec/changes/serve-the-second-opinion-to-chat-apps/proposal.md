## Why

A member working in claude.ai or ChatGPT cannot get a second opinion. `ctxr second-opinion` runs only in a shell. `ctxr-second-opinion` is the one shared-purpose skill the `contexture` plugin leaves out. `serve-the-session-lifecycle-to-chat-apps` D10 deferred it until a sandbox per job or a vendor-API backend existed.

This change takes the route of the second one, kept small. Every run of a model CLI, in a shell and on the server alike, gets a fresh temporary folder as its home and working directory, seeded with only that CLI's login file. The kernel (Landlock, applied through `setpriv`) limits the run to that folder plus the system directories it needs to execute. The store's server then runs the command exactly as a shell does, and refuses it on a machine that cannot confine the run.

## What Changes

- **Each model CLI runs confined to a fresh home of its own, in the CLI and on the server alike.**
  - The temp folder is both its `HOME` and its working directory, holding only a copy of that CLI's login file.
  - A login the CLI refreshed during the run is copied back, unless the original changed meanwhile, and the folder is removed afterwards.
  - Where `setpriv` supports Landlock, the run can read only the system directories, the CLI's own install directory and that folder, and write only the folder.
  - The prompt also tells each critic that the folder is all it may use. That is a second layer, not the boundary.
  - Where confinement is not available (macOS, older util-linux), the run behaves as today, and `preflight` reports it as not confined.
- **`ctxr second-opinion` joins the `ctxr` tool's allowlist.**
  - `preflight`, `critique` and `poll` run through the store's server with the same argument vector, the same environment allowlist and the same exit codes as in a shell.
  - Nothing about them is reimplemented for MCP.
- **The `ctxr` tool takes `input` for `second-opinion`.** A plan or question written in chat goes as `input`, with `@input` in `args` where `--plan-file` or `--prompt-file` takes its path, as `ctxr_write` already does. The file is written outside the checkout and removed after the run. Other read commands still take no `input`.
- **New `--print` option on `critique` and `poll`.**
  - The answers are printed on stdout, letters first and the letter-to-model table last.
  - No output directory is written.
  - Through the server, the `ctxr` tool adds `--print` itself, so no member's plan is left on the server's disk and the answers reach the chat at all.
- **A time bound of its own.**
  - The runner's bound for `second-opinion` is 240 seconds, not the 30 seconds that suits `lint`. 240 s is under the roughly four minutes claude.ai and Claude Desktop wait for a tool.
  - The runner passes a per-CLI `--timeout` of 200 seconds and refuses a larger one, so a slow model comes back as a failed critic in a partial result rather than losing all three answers.
- **One second opinion at a time per server.** A second call while one runs is refused with "busy, try again in a few minutes", because three model CLIs at once need most of a small container's memory.
- **`ctxr-second-opinion` ships in the plugin.**
  - It joins the shared skills (one text, opening with the shared "Which store, and where" section).
  - Its shell-only steps say how each is done through the server: environment variables are the operator's, and runs aren't started in the background.
  - It gets a typed command, `/contexture:second-opinion`.
- **The server refuses `second-opinion` unless the run is confined.** On an unconfined server, `ctxr` refuses the command with the reason and runs nothing.
- **Supersedes `serve-the-session-lifecycle-to-chat-apps` D10.** It takes D10's "one sandbox per job" option, with a fresh folder and Landlock in place of a uid of its own. The README's rule for the approval key stands: a confined critic cannot read it.
- **contexture-images (paired PR):**
  - The `serve` service installs `claude`, `codex` and `agy` into its own home.
  - Its memory limit is raised so three CLIs fit.
  - The README says how the operator signs each one in once (`docker compose exec serve …`).

## Non-goals

- **A separate user, namespaces or a vendor-API backend.** Docker's default seccomp profile blocks the user namespaces that bubblewrap needs, and Landlock alone does the job (design.md D1). An API backend would be a second code path the critique was never tuned on.
- **Confinement on macOS.** It has no Landlock. A laptop run there stays as it is today and says so.
- **Start-and-fetch tools for long runs.** One blocking call within about four minutes covers the measured default-tier critique (one to two minutes). A deep run at maximum effort stays a shell job. Adding a job store and a second tool before a timeout is seen would be machinery for a case not yet met.
- **Choosing models or efforts from chat.** The `CTXR_SECOND_OPINION_*` overrides stay in the server's environment, set by the operator. A member can still pass `--tier`, `--only` and `--lens`.
- **ChatGPT-specific handling.** The ChatGPT plugin carries the same skill. Its client's own time limit is not measured here (tasks 6).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `remote-access`: the `ctxr` tool's allowlist gains `second-opinion`, with `input`, its own time bound, `--print` added by the server, one run at a time, and a refusal when the run cannot be confined.
- `cli-contract`: `critique` and `poll` gain `--print`.
- `harness-portability`: each model CLI runs confined to a fresh home seeded with its login, reported by `preflight`; and the second-opinion skill joins the shared skills the plugin carries, and the plugin gains its command. This supersedes the exclusion recorded in "The shared skills are one text on both surfaces".

## Impact

- **Code:**
  - `src/core/second-opinion/launch.ts` and `lineup.ts`: the fresh home, each CLI's login file and install directory, and the `setpriv` Landlock wrapper.
  - `src/core/mcp/tool-map.ts`: the allowlist and the per-command bound.
  - `src/core/mcp/tools/cli.ts`: `input` on `ctxr`, `--print` and `--timeout` handling, and the single-run guard.
  - `src/core/second-opinion/modes.ts` and `src/run.ts`: `--print`.
  - `src/core/skills.ts`: `MCP_SKILL_FILES`.
  - `src/core/plugin/commands.ts`: the new command.
- **Templates:**
  - `templates/skills/ctxr-second-opinion.md` is reworded for both surfaces.
  - `templates/mcp/ctxr.md` documents `input`.
- **Plugin:** `plugins/contexture/` is regenerated with `npm run plugin`.
- **Docs:** README (the serve section: signing the CLIs in, and that runs are confined).
- **contexture-images:** `runtime/compose.yaml` (`serve`'s `HARNESSES` and memory) and the README. The image already carries `setpriv` from util-linux 2.41, so it needs no new package.
- **Deployments:**
  - A store's server answers `second-opinion` only after its operator signs the CLIs in.
  - Until then, `preflight` names each one as down and the skill says so to the member.
- **openspec:**
  - This change archives after `publish-one-contexture-plugin`, whose delta adds the requirement this one modifies.
  - `openspec/config.yaml`'s second-opinion exception sentence gains "including through the store's server".
