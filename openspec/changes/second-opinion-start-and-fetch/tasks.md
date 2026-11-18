# Tasks

## 0. Before implementing

- [x] 0.1 Run `ctxr second-opinion critique` on this change's design.md, as the shipped skill requires for an architectural change. Fold accepted findings back into design.md with `/opsx:update`, and record the verdicts for the pull request body. Verify: the synthesis is in the PR draft, and `openspec validate second-opinion-start-and-fetch --strict` passes.

## 1. Run folders, lock and sweep (core)

- [x] 1.1 Add `src/core/second-opinion/runs.ts`. It covers:
  - the per-user runs root (0700, owner checked);
  - run id generation (128-bit, base32);
  - reading and writing `run.json` (pid, process start time, owner, start, finish, exit code);
  - liveness from the pid and start time;
  - the `.lock` exclusive create, with takeover from a dead pid;
  - the sweep (mark stopped, remove folders older than one hour past their end).

  Verify: `npx vitest run test/unit/second-opinion-runs.test.ts`, with cases for a dead-pid takeover, a reused pid with a different start time, the one-hour removal, and a parent folder that is not 0700 or not owned by the user being refused.

## 2. `--detach` and `result` in the CLI

- [x] 2.1 Add `--detach` to `critique` and `poll` in `src/commands/second-opinion.ts` and `modes.ts`:
  - all existing refusals run first;
  - `--detach` with `--out` is a usage error, and `preflight` refuses `--detach`;
  - then take the lock, sweep, create the run folder, write `input.md`, spawn the detached child with the hidden `--run-folder`, print the run id and exit `0`.

  Verify: unit tests in `test/unit/second-opinion.test.ts`, with stubbed model CLIs, for the three `--detach` scenarios in specs/cli-contract.
- [x] 2.2 Make the child path: `--run-folder` writes the `--out` layout into the folder and the finish fields into `run.json`, then releases the lock. Verify: a unit test runs a detached critique against stub CLIs to completion, then checks `manifest.json`, the letter files and `run.json` finish fields.
- [x] 2.3 Add `ctxr second-opinion result <run> [--wait N]` (default 45). It renders a finished run through the `--print` renderer with the run's exit code. A running run reports `running` and elapsed time with exit `0`, a stopped run exits with the failed-check code, and an unknown id is a usage error. `--json` carries `state`. Verify: unit tests for every scenario under "fetches a run within a bounded wait", "reported as stopped" and "one detached run at a time" in specs/cli-contract.
- [x] 2.4 Update the CLI reference documentation for `second-opinion` (the `--help` text and the README or docs page that lists its options) with `--detach`, `result` and the run lifetime. Verify: `node dist/bin.js second-opinion result --help` after `npm run build` shows `--wait`, and `--run-folder` does not appear in any `--help`.

## 3. The server runner

- [x] 3.1 In `src/core/mcp/tool-map.ts` and `tools/cli.ts`:
  - add `second-opinion result` to the allowlist and `SECOND_OPINION_COMMANDS`;
  - refuse `--run-folder`;
  - cap `--wait` at 45 and `--timeout` at 600;
  - remove `secondOpinionRunning`;
  - stamp the member's email through the internal owner variable, and add that variable's name to the environment module's protected handling so no model CLI sees it.

  Verify: `npx vitest run test/unit/mcp-second-opinion.test.ts`, with cases for the allowlist, the refusals and the caps.
- [x] 3.2 Rewrite the blocking form through the server as detach plus `result --wait 45`. A finished run returns the critiques. An unfinished one returns the run id, "still running" and the fetch instruction. Verify: tests in `mcp-second-opinion.test.ts` for both scenarios under "starts a run and waits a bounded time", using stub CLIs that sleep past a test-sized bound.
- [x] 3.3 Enforce ownership. `result` through the server treats another member's run as no such run. A busy refusal names the running id only to its owner. Verify: tests with two member emails covering both ownership scenarios in specs/remote-access.
- [x] 3.4 Update the `ctxr` tool's description string (one second opinion at a time, up to four minutes) to describe start, then `result`. Verify: `npx vitest run test/unit/mcp-tool-alignment.test.ts` passes, and the description names `second-opinion result`.

## 4. The shared skill

- [x] 4.1 Rewrite section 3 and the poll section of `templates/skills/ctxr-second-opinion.md` per design D8:
  - start with `--detach`, then fetch with `result`, the same steps for the shell and the server;
  - on a busy refusal, fetch the named run;
  - replace "the chat app stops waiting for a tool after about four minutes" with the measured 125 s cut and the 45 s wait;
  - remove "Run a deep pass in a shell".

  Check the banned tier words and flag attribution before committing. Verify: `npm run build && npx vitest run test/unit/skills*.test.ts` passes, and a grep of the rendered skill for "four minutes" finds nothing.

## 5. Integration and live check

- [x] 5.1 Run `npm run build && npm test`. Verify: exit code `0`.
- [ ] 5.2 After the release reaches pkm-serve and `ctxr-serve` is restarted, run the plan from the 2026-11-14 failure (130 to 145 s at the default tier) from claude.ai. Use `["second-opinion", "critique", "--plan-file", "@input", "--detach"]`, then `result`. Verify:
  - each tool call's `duration_ms` is under 55000;
  - the final `result` carries three letters;
  - cloudflared logs no "context canceled" for `/mcp` in that window (`docker logs --since 10m cloudflared | grep -c "context canceled"` prints `0`).
- [ ] 5.3 In the same session, start a second detached critique while the first runs. Verify: it is refused, naming the first run's id, and `result` for that id returns its critiques.

## Workflow follow-up

- serve-the-second-opinion-to-chat-apps must archive first: this change MODIFIES two `remote-access` requirements that change adds. Run `openspec validate second-opinion-start-and-fetch --strict` after that archive and confirm the archive-refusal note is gone.
- That change's task 6.2 (measure each client's real limit) is answered by the 125 s measurement recorded in this design. Check it off there, citing this change.
- Archive this change after the pull request merges and 5.2 has passed on the live store.
