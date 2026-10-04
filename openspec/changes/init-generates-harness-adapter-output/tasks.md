## 1. Move the generator into core

- [ ] 1.1 Create `src/core/adapter-outputs.ts` and move `generateAdapterOutputs` and
      `AdaptersGenerateFileResult` into it from `src/commands/adapters-generate.ts`. Drop the unused
      `git` parameter, so the signature takes `store: Store` only (D1).
- [ ] 1.2 Make `src/commands/adapters-generate.ts` a thin command over the core function. Keep
      `AdaptersGenerateData`, the human summary and the exit codes unchanged, and re-export the result
      type if any test imports it from the command module.
- [ ] 1.3 Run `npm run typecheck`. It exits 0, and `npx vitest run test/unit/adapters-generate-command.test.ts`
      passes unchanged.

## 2. One reconcile for every existing-store entry point

- [ ] 2.1 `src/core/reconcile.ts`: call the generator with `{ root, config }` after the `AGENTS.md`
      reorder and before `installHooks`. Push every `changed: true` path onto `changed`. Update the
      function's doc comment to list adapter outputs among what it brings current (D1).
- [ ] 2.2 `src/commands/update.ts`: delete the separate `generateAdapterOutputs` call and its merge
      into `all`, and take `changed` from the reconcile alone. The doc comment on `execute` keeps
      listing adapter outputs.
- [ ] 2.3 `src/commands/init.ts`, already-initialized branch: no code change. Its comment ("exactly
      `ctxr update`'s job") becomes true. Confirm the comment needs no edit.
- [ ] 2.4 `test/unit/update-command.test.ts`: the "already current" case still passes after this
      section. Its first update still reports `CLAUDE.md`, because init does not generate yet. Run it:
      `npx vitest run test/unit/update-command.test.ts` exits 0.

## 3. Fresh init generates and commits

- [ ] 3.1 `src/commands/init.ts`, fresh path: after `buildAgentsConventionsSection` and before
      `installHooks`, call the generator with `{ root, config }` and collect the paths reported
      `changed: true` (D2).
- [ ] 3.2 Same file: append those paths to the `addPaths` list and to `created`. Stage no path the
      generator reported unchanged.
- [ ] 3.3 Run `npm run build`, then run
      `node dist/bin.js init --root <scratch> --profile para --harness claude-code --no-input`.
      `CLAUDE.md` exists, `git -C <scratch> show --name-only HEAD` lists it, `.claude/settings.json`
      does not exist, and `git -C <scratch> status --porcelain` is empty.

## 4. Docs

- [ ] 4.1 `README.md` quick start: remove the `ctxr adapters generate` line after `ctxr init`, and the
      paragraph explaining that init does not write adapter output.
- [ ] 4.2 `README.md` harness bullet: `claude-code` generates `CLAUDE.md`. Drop the claim about a
      `.claude/settings.json` wiring up the write-gate hook, which was retired.
- [ ] 4.3 `README.md` on-disk listing: introduce it as "After `ctxr init --profile para`". Remove the
      `settings.json` and `hooks/` lines under `.claude/`, and keep the `skills/` bridge line.
- [ ] 4.4 `README.md` command table: `adapters generate` only, with no `write-gate`. That subcommand
      was removed by `retire-the-write-gate`.
- [ ] 4.5 Confirm `templates/skills/ctxr-derived-artifacts.md` needs no edit. It names `ctxr update`
      for entry files and `ctxr adapters generate` for adapter outputs, and both stay true.
      `grep -n "adapters generate" templates/skills/ctxr-derived-artifacts.md` shows the unchanged line.

## 5. Tests

- [ ] 5.1 `test/unit/update-command.test.ts`: the first update after `init` reports `changed: []`.
      Drop the comment explaining that init does not run the adapters. This is the "Update after init
      is a no-op" scenario.
- [ ] 5.2 Same file, or `test/integration/init-noninteractive.test.ts`: init with `harness: 'none'`,
      then update, reports `changed: []`, and there is no `CLAUDE.md`. This is the "Update after a
      no-harness init is a no-op" scenario.
- [ ] 5.3 `test/integration/init-noninteractive.test.ts`: real-CLI `init --harness claude-code --no-input`.
      `CLAUDE.md` holds the managed `@AGENTS.md` import, `git ls-files` includes it, the envelope's
      `data.created` includes it, `.claude/settings.json` is absent from disk, from `created` and from
      the commit, and `git status --porcelain` is empty. This covers "A harness that declares an entry
      file gets it in the initial commit" and "Nothing is created for an adapter that contributes
      nothing".
- [ ] 5.4 Same file: `init --harness hermes-agent --no-input`. There is no `CLAUDE.md`, `.hermes/skills`
      is bridged, and the exit code is 0. This is "A harness that reads the entry document directly
      gets no entry file". Also add a `--harness none --no-input` case asserting there is no
      `CLAUDE.md` and no `.claude/` directory ("Selecting no harness is valid"). No init test covers
      `none` today; it appears only as setup in `note-templates.test.ts`.
- [ ] 5.5 `test/integration/init-idempotent.test.ts`: on an initialized claude-code store, delete
      `CLAUDE.md` and re-run `init`. The file is back with the import, `contexture.yaml` is
      byte-identical, the commit count is unchanged, and a third `init` leaves every mtime unchanged.
      This is "Re-running init restores a missing entry file". The existing no-op test keeps passing
      unchanged.
- [ ] 5.6 `test/integration/adapters-and-entry-doc.test.ts`, the "verify --portable … no harness state"
      case: remove `CLAUDE.md` from the session worktree before running `verify`, and keep the
      absence assertions, so the test still proves `verify` passes with no harness entry file
      (design, Risks). The `adapters generate` byte-identical case keeps passing, with its first run
      now reporting nothing changed.
- [ ] 5.7 `test/unit/agents-doc.test.ts`, the two direct `reconcileStore` calls: confirm they still pass
      now that the reconcile also writes `CLAUDE.md` for the default adapter. Adjust an assertion only
      if one enumerates the store's files.

## 6. Verification

- [ ] 6.1 `npm run typecheck` and `npm run build` both exit 0.
- [ ] 6.2 `npm test` exits 0.
- [ ] 6.3 End to end on a scratch directory:
      `node dist/bin.js init --root <scratch> --profile para --harness claude-code --no-input`, then
      `node dist/bin.js --root <scratch> update --json`. This prints `"changed":[]`.
- [ ] 6.4 `openspec validate init-generates-harness-adapter-output --strict` exits 0.
