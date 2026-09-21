## 1. Composing a labelled name

- [x] 1.1 `src/core/session.ts`: `sessionLabelSlug(raw)` — normalizes a caller's label with
      `slugifySegment` (moved to `src/core/slug.ts` and re-exported from `publish/filing.ts`, D3), truncates to at most 48
      characters at the last `-` boundary at or before the cap, trims a trailing `-`, and returns the
      empty string when nothing survives. The doc comment cites D3 for why it reuses the publish
      slugifier rather than defining a second rule.
- [x] 1.2 Same file: `generateSessionBranchName(config, now, label?)` — with a label, the normalized
      slug takes the random suffix's place (`<prefix><stamp>-<slug>`); with none, the existing random
      suffix is produced unchanged. The comment states why the stamp stays in front: alphabetical
      ordering of worktree directory names is what `listSessionWorktreeDirs` and the browse
      navigation sort by, and a leading stamp keeps that order chronological (D2).
- [x] 1.3 `test/unit/session.test.ts`: extend the existing `generateSessionBranchName` block (which
      already pins the prefix, uniqueness, and sortability) — a label appears in the name; the
      configured prefix still applies; two unlabelled calls still differ; two calls with the same
      label at the same instant produce the same name (the collision D4 refuses, pinned here as a
      property of the composer rather than left implicit); punctuation-only normalizes to empty;
      an over-long label truncates on a boundary and carries no trailing `-`.
- [x] 1.4 `npx vitest run test/unit/session.test.ts` green.

## 2. Refusing a label the command cannot honor

- [x] 2.1 `src/core/errors.ts`: `SessionLabelUnusableError(label)` and
      `SessionNameExistsError(label, worktreePath)`, both `ExitCode.Usage`, with codes
      `session.label_unusable` and `session.name_exists`, following the shape of
      `PublishInvalidSlugError` / `PublishSlugExistsError` immediately above them. The exists-error
      message names the existing session's worktree, since working there is what the caller most
      likely wants next.
- [x] 2.2 Same file: `SessionWorktreeRefusedError(branch, worktreePath, stderr)` — `ExitCode.Usage`, code
      `session.worktree_refused`, carrying git's stderr as `details` rather than as the message (D5).
- [x] 2.3 `src/core/git/worktree.ts`: `addWorktree` gains an `allowFailure` option and returns the
      `GitResult`, leaving its existing callers' behavior unchanged when the option is absent.
- [x] 2.3b `src/core/session.ts`: `sessionLabelFromDirName` recovers a session's label by matching the
      composed name (prefix, fixed-width stamp, label) rather than by a suffix test, and
      `findSessionWorktreeByLabel` scans `listSessionWorktreeDirs` for the session holding a label.
      Unit-covered including the `ctx-a` / `a` trap (D7).
- [x] 2.4 `src/commands/session-start.ts`: `execute(env, store, opts: { label?: string })` — normalize
      the label and refuse an empty result with `SessionLabelUnusableError`; refuse a label an
      existing session already carries with `SessionNameExistsError`, both ahead of the fetch so a
      label that cannot work costs no network round trip; compose the name; then create the worktree
      with failure allowed and raise `SessionWorktreeRefusedError` on a non-zero result. The release
      advisory stays after the worktree exists, as it is today.
- [x] 2.5 `src/run.ts`: `session start` gains `.argument('[label]', 'a short name for what the session
      is for — becomes part of the branch and worktree name')` and passes it to `execute`. The action
      signature takes the positional ahead of `cmdOpts`.
- [x] 2.6 `test/integration/session-lifecycle.test.ts`: a labelled start puts the label in
      `data.branch` and in the worktree path, and `git worktree list` shows it; the existing
      unlabelled tests still pass untouched; a repeated label exits 2 with `session.name_exists` in
      the `--json` envelope's findings and leaves `git worktree list` unchanged; a punctuation-only
      label exits 2 with `session.label_unusable` and creates nothing; a label is free again once its
      worktree is removed; a branch prefix git refuses reports `session.worktree_refused`, not an
      internal error.
- [x] 2.7 `npx vitest run test/integration/session-lifecycle.test.ts` green.

## 3. The prose stores read

- [x] 3.1 `templates/skills/ctxr-session-lifecycle.md`, "## Start": the optional label, what it is for
      (finding the right worktree in `ctxr session list` and in the preview listing), that a session
      started without one is normal, and that a taken label is refused rather than adjusted. One
      sentence that a label lands in a git ref and a directory name, so it is not the place for
      anything sensitive (design.md Risks).
- [x] 3.2 `templates/skills/ctxr-submit.md`, step 7: the label does not satisfy this step — a session
      may carry one and still need a branch name chosen for the forge (D6).
- [x] 3.3 Prose lands in `templates/`, never as a string literal in TypeScript (CONTRIBUTING.md), and
      follows the shipped-skill register: no tier words, no attribution of behavior to a flag the
      skill does not tell the reader to pass.
- [x] 3.4 `npx vitest run test/integration/owned-skills.test.ts` green — the managed skill copies
      still generate and reconcile from the edited templates.

## 4. Verification

- [x] 4.1 `npm run typecheck` and `npm run build` clean.
- [x] 4.2 `npm test` green.
- [x] 4.3 Exercised against a real store: `ctxr session start ctx-a` produced
      `session/20260920-180826-ctx-a` and the matching worktree; `ctxr session list --json` showed it;
      a second `ctxr session start "Ctx A"` exited 2 with the existing worktree named, leaving
      `git worktree list` byte-identical; `ctxr session start '...'` exited 2; bare
      `ctxr session start` exited 0 with a random suffix; an over-long label truncated to
      `...-a-rather-long-label-about-the-retrieval`; and `ctxr serve` grouped the preview page under
      `session-20260920-180826-ctx-a`.
- [x] 4.4 `openspec validate name-the-session-at-start --strict` exits 0.
