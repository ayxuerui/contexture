# Proposal

## Why

A second opinion asked for through a store's server fails once it takes longer than about two minutes. On the live store, every such call was cut 125 seconds after it reached the server: five of five on 2026-11-14 and 2026-11-15. Each time, the tunnel logged the incoming request as ended abruptly. Each cut matched a `tools/call ctxr` to the second. The server allows 240 seconds and sends nothing until the whole answer is ready, so a long plan at the default tier fails every time. The chat app reports "the connector's server isn't responding".

The failure also blocks the retry. The run keeps going after the call is dropped, and the one-at-a-time lock belongs to that HTTP call. A retry made within the next four minutes is refused as busy, then cut again.

serve-the-second-opinion-to-chat-apps D3 named start-and-fetch as the next change if real use showed a client dropping the call before 240 seconds. This is that case. The operator wants the shell and the server to have the same steps, so one skill text serves both.

## What Changes

- `ctxr second-opinion critique` and `ctxr second-opinion poll` gain `--detach`. It starts the run in the background, prints a run id, and returns at once.
- New `ctxr second-opinion result <run>`. It waits up to `--wait` seconds (default 90) for that run, then prints the answers in the same form as `--print`. If the run has not finished, it prints that it is still running, and how long it has run.
- A detached run's state and answers live in a run folder under the machine's temporary directory, private to the user. The folder is removed one hour after the run finishes, so a fetch whose response was lost can be repeated.
- One detached run at a time per machine user, in a shell and on the server alike. A second `--detach` is refused as busy and names the run already going, so the caller can fetch that one instead.
- Through the store's `ctxr` tool:
  - `--detach` and `result` take the same arguments as in a shell. `result --wait` is capped at 90 seconds, so every call answers well inside the measured 125-second cut.
  - A run belongs to the member who started it, and `result` refuses anyone else's.
  - The per-CLI `--timeout` cap rises from 200 to the shell's 600 seconds, since no HTTP call waits on the run any more.
- **BREAKING (server only):** a `critique` or `poll` through the `ctxr` tool without `--detach` no longer blocks for up to 240 seconds. It starts a detached run and waits up to 90 seconds for it. A run that finishes in time returns the answers as before. A run that does not returns the run id and says to fetch it with `result`. Skill copies in stores that still call the blocking form keep working for short plans and get a fetch path for long ones.
- The shared second-opinion skill runs every critique and poll as `--detach`, then `result`, the same way in a shell and through the server. The claim that the chat app waits about four minutes is removed. The measured cut is 125 seconds.

## Non-goals

- **Streaming progress or keepalive bytes on the blocking call.** Keepalive bytes would only defeat an idle timeout at the tunnel, and the source of the 125-second cut is not established: it may be the chat app's own total limit. Start-and-fetch works under either.
- **A queue of detached runs.** A queued run still holds the machine's three model CLIs for minutes. Refusing with the id of the running job lets the caller fetch that run instead of starting a duplicate.
- **Runs that survive a server or machine restart.** A restart stops the run, and `result` reports it as stopped. Resuming would need the model CLIs to resume, and they cannot.
- **Detaching the preflight.** It answers in about twenty seconds and stays a blocking call.
- **Keeping answers beyond an hour.** The shell keeps answers longer with `--out` on a blocking run, as it always has. The server leaves nothing behind after the hour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-contract`: `--detach` on `critique` and `poll`; the new `result` command, its wait, and its output; the one-detached-run rule and its busy refusal; the run folder and its one-hour lifetime.
- `remote-access`: the second opinion's time bound and one-at-a-time rule change from one blocking call to a detached run fetched in bounded calls. Each run belongs to the member who started it. The blocking form becomes start-and-wait-90-seconds.

## Impact

- `src/core/second-opinion/`: a run-folder module (state file, owner, start and finish times, pid, lock, sweep). The detached child process. `result` rendering reuses the `--print` output.
- `src/commands/second-opinion.ts`: the `--detach` flag and the `result` subcommand.
- `src/core/mcp/tool-map.ts` and `src/core/mcp/tools/cli.ts`: `second-opinion result` joins the allowlist. The module-level `secondOpinionRunning` flag gives way to the run-folder lock. Ownership is stamped from the member's email. The `--wait` cap, the blocking form rewritten as start-and-wait, and the raised `--timeout` cap.
- `templates/skills/ctxr-second-opinion.md`: section 3 and the poll section run start-then-fetch for both surfaces. The four-minute claim is corrected.
- Release notes: the server-side change to the blocking form.
- Ordering: this change modifies requirements that serve-the-second-opinion-to-chat-apps adds to `remote-access`. That change archives first.
