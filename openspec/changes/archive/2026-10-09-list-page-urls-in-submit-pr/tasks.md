## 1. Config

- [x] 1.1 `src/config/schema.ts`: add `previews: z.enum(['local','none']).optional()` to `ServeSchema`. No
      `SHIPPED_DEFAULTS` entry; `serve` stays optional. Tests: omitted, `local`, `none`, invalid value rejected;
      `ctxr init` still writes no `serve:` block.

## 2. Address report

- [x] 2.1 Previews-off is handled inside `publish urls` itself; `pageServedAt` and `publish new`/`check` are unchanged.
- [x] 2.2 `src/commands/publish-urls.ts`: require exactly one of `--staged` / `--since <ref>`; read
      `git diff --name-status -M` for it; keep `index.html` entries under `publish.path`; map to
      added / modified / moved (old path and old published address) / removed (no preview); build addresses via
      `pageServedAt`. Text output plus `--json` in the shape of design D7; the no-base-URL line.
- [x] 2.3 Register the subcommand beside `publish new` / `check`; update the CLI contract spec check if one enumerates commands.
- [x] 2.4 Tests, one per scenario in `specs/publish/spec.md`, using a real git repo fixture with a rename;
      include a base URL carrying a path prefix, a file outside the publish path, and a non-index file.

## 3. Submit skill

- [x] 3.1 `templates/skills/ctxr-submit.md` step 8: before `gh pr create`, run
      `ctxr publish urls --since origin/__DEFAULT_BRANCH__ --json`; when non-empty add the Pages table and
      the one-line reachability caveat to the body; when empty add nothing. Prose lives in the template only.
      Check the shipped-skill rules first: the seven banned tier words and flag attribution.
- [x] 3.2 Rendering tests for the two new `harness-portability` scenarios.
- [x] 3.3 `templates/skills/ctxr-publish.md`: where it tells the agent to report a moved page's changed URL,
      point to `ctxr publish urls` and the PR record.

## 4. Verify

- [x] 4.1 `openspec validate list-page-urls-in-submit-pr --strict`, the full test suite, typecheck and lint.
