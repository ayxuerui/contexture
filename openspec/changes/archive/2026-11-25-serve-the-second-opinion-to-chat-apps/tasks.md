## 0. A fresh, confined home for each run (D1)

- [x] 0.1 In `src/core/second-opinion/lineup.ts`, declare each CLI's login files, relative to `HOME`:
  - claude `.claude/.credentials.json`
  - codex `.codex/auth.json`
  - agy `.gemini/antigravity-cli/antigravity-oauth-token`

  Also declare how its install directory is found from the resolved binary, and the system paths every run may read.
- [x] 0.2 In `src/core/second-opinion/launch.ts`:
  - make the fresh temp folder `HOME` and the working directory;
  - copy the login files in, and copy back a changed one when the original's hash is unchanged since the copy;
  - remove the folder in `finally`.
- [x] 0.3 Detect Landlock support once per run, by `setpriv --help` listing `--landlock-access` and a probe `setpriv` run of `true` succeeding. When supported, prefix each argument vector with `setpriv --landlock-access fs` and one `--landlock-rule path-beneath:<rights>:<path>` per declared path; otherwise run unconfined with the real `HOME`. Add `confined` and `reason` to the preflight and critique manifests.
- [x] 0.4 Add one sentence to `templates/second-opinion/critic-contract.md` telling the critic that its working folder is all it may use.
- [x] 0.5 Stub-CLI tests in `test/unit/second-opinion.test.ts`:
  - each stub's `HOME` held only its login, and is gone afterwards;
  - a stub's rewrite of `auth.json` is copied back, and not copied back when the original changed meanwhile;
  - on a host whose `setpriv` supports Landlock (skipped elsewhere, saying why), a stub reading a canary file outside its folder gets a permission error;
  - preflight reports `confined` and the reason.

  `npx vitest run test/unit/second-opinion.test.ts` exits 0, and the Landlock case runs in CI's Linux image or is shown skipped.
- [x] 0.6 Measurement gate, with the real CLIs: run `ctxr second-opinion preflight` and one `--tier fast` critique, both confined, on a Linux host with util-linux ≥ 2.40 (a `contexture-runtime` container with the three CLIs installed). Both exit 0, and `manifest.json` records `confined: true`.

## 1. `--print` on the CLI (D2)

- [x] 1.1 Add `--print` to `critique` and `poll` in `src/run.ts`, and in `src/core/second-opinion/modes.ts`:
  - no output directory, no scratch-raw files kept;
  - critiques in letter order, then the letter table;
  - poll answers under their model;
  - `--json` carries the texts beside the manifest;
  - `--print` with `--out` is a `SecondOpinionUsageError`.
- [x] 1.2 Stub-CLI tests in `test/unit/second-opinion.test.ts`:
  - the printed order;
  - no `ctxr-second-opinion-out-*` directory created;
  - same exit codes as without `--print`;
  - the usage error.

  `npx vitest run test/unit/second-opinion.test.ts` exits 0.

## 2. `second-opinion` through the `ctxr` tool (D3, D4, D5)

- [x] 2.1 Add `second-opinion preflight|critique|poll` to `CTXR_READ_COMMANDS` in `src/core/mcp/tool-map.ts`. Add a declared per-command bound: 240 s for `second-opinion`, `CLI_TIMEOUT_MS` otherwise. Add a declared per-CLI cap of 200 s.
- [x] 2.2 In `src/core/mcp/tools/cli.ts`:
  - accept `input` on `ctxr` only for `second-opinion`;
  - write it to a fresh temp directory outside the checkout and remove the directory in `finally`;
  - append `--print` to `critique` and `poll`;
  - append `--timeout 200` when none is given;
  - refuse a larger `--timeout` and any `--out`;
  - pass the per-command bound to `runServerCli`.
- [x] 2.3a Add `--require-confinement` to `second-opinion preflight|critique|poll` (`src/run.ts`, `modes.ts`): exit with the failed-check code, naming the reason, before any model CLI starts when the run cannot be confined. The `ctxr` tool appends it to every `second-opinion` command.
- [x] 2.3 Add the single-run guard. It refuses `mcp.busy` while a `second-opinion` call (`preflight` included) is in flight, and releases in `finally`.
- [x] 2.4 Run `second-opinion` in the input's temp folder rather than a store checkout: it reads no store (`store: 'absent'`), so it runs outside the view's read lock, and `ran_against` still names the served commit or the session.
- [x] 2.5 Document `input` for `second-opinion` in `templates/mcp/ctxr.md`. The server instructions need no change.
- [x] 2.6 Tests in `test/unit/mcp-second-opinion.test.ts`, with stub CLIs on `PATH`:
  - a critique through `ctxr` returns the three texts, and no input file or output directory remains;
  - a stub that sleeps past the cap gives a partial result within the bound;
  - a concurrent call is refused busy;
  - `--timeout 600` and `--out` are refused;
  - `["lint"]` with `input` is refused;
  - forge variables still never reach a stub;
  - an unconfined server returns the failed-check code and the reason (with a stub `setpriv` that has no Landlock).

  `npx vitest run test/unit/mcp-cli.test.ts test/unit/mcp-tool-alignment.test.ts` exits 0.

## 3. The skill and the plugin (D6)

- [x] 3.1 Reword `templates/skills/ctxr-second-opinion.md` for both surfaces:
  - the plan as `input` with `@input`;
  - answers in the result through the server;
  - environment variables, background runs and raised timeouts as the operator's or shell-only, said at each step;
  - a CLI down through the server means asking the operator to sign it in;
  - stop reading at the letter table until the synthesis is written.

  Keep it free of the seven tier words and of flag attribution.
- [x] 3.2 Add `SECOND_OPINION` to `MCP_SKILL_FILES` in `src/core/skills.ts`, and update its doc comment. Add `'second-opinion': 'ctxr-second-opinion'` to `PLUGIN_COMMANDS` in `src/core/plugin/commands.ts`.
- [x] 3.3 Update `test/unit/skills.test.ts`, whose pinned list and absent set must no longer list second-opinion, and the plugin command tests.
- [x] 3.4 Run `npm run plugin` and commit the regenerated `plugins/contexture/`. Then `npx vitest run test/unit/skills.test.ts test/unit/plugin-committed.test.ts` exits 0, and `claude plugin validate plugins/contexture` passes.

## 4. Docs and project context (D1)

- [x] 4.1 README:
  - the second-opinion section says each run is confined to a fresh folder holding only its login, on Linux with util-linux ≥ 2.40, and what `confined: no` means;
  - the serve section says how to sign the CLIs in, and that serve refuses unconfined runs.
- [x] 4.2 Update the second-opinion exception sentence in `openspec/config.yaml` to say it also runs through the store's server. Run `openspec validate serve-the-second-opinion-to-chat-apps --strict`; it exits 0.
- [x] 4.3 Run `npm run typecheck && npm run build && npm test`; it exits 0.

## 5. contexture-images (paired PR, D1)

- [x] 5.1 In `runtime/compose.yaml`, set `serve`'s `HARNESSES` to `claude,codex,agy` and raise its memory limit to the value measured in 6.1, with a comment naming this change. Leave the App key's mount and the default seccomp profile unchanged.
- [x] 5.2 Add to the README `serve` section: the CLIs, that their runs are confined by `setpriv`/Landlock (already in the image), and the one-time sign-in (`docker compose exec serve` then each CLI's login). Then the images CI passes on the branch (`ci.yml`).

## 6. Real clients (operator checkpoint)

- [x] 6.1 (Measured 2026-11-11 in a throwaway `contexture-runtime:1.0.0` container with the real CLIs and logins: a confined default-tier critique peaked at 420 MB; live serve uses 90-160 MB; limit set to 1G.) On a store's `serve` with the CLIs signed in, run `ctxr second-opinion preflight` and one default-tier critique, recording the peak memory (`docker stats`). Set 5.1's limit from that figure.
- [ ] 6.2 After the release: from claude.ai, ChatGPT and Claude Code, type `/contexture:second-opinion` on a short plan. Record that each returns three letters, and each client's elapsed time and any client-side timeout. A drop under 240 s is the trigger for start-and-fetch (D3).

## 7. Archive order

- [ ] 7.1 Archive after `publish-one-contexture-plugin`, whose delta adds "The shared skills are one text on both surfaces". Check the synced requirement both ways: the plugin carries second-opinion, and not upgrade or land.
