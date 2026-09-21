## 1. Naming the command an invocation reached

- [x] 1.1 `src/run.ts`: `commandPathFor(program, argv)` — walks the registered command tree, matching
      each leading argv token against the subcommands registered at that level (by name and alias),
      stopping at the first token that is not one or that begins with `-`. Returns the matched names
      dot-joined, or the empty string when none matched. The doc comment states why the tree is walked
      rather than argv read positionally: `publish new my-page --bogus` must not report a page slug as
      a command (D2).
- [x] 1.2 `test/unit/run-usage-errors.test.ts` (new): asserted through the envelope's `command` field
      rather than by exporting the resolver — `session start --slug x` reports `session.start`;
      `publish new my-page --bogus` reports `publish.new`, not the slug; an unregistered leading word
      and a leading flag both report the empty string.
- [x] 1.3 `npx vitest run test/unit/run-usage-errors.test.ts` green.

## 2. The envelope, and one message

- [x] 2.1 `src/run.ts`: in the `parseAsync` catch, keep the help/version early return, stop writing
      `err.message` (commander has already written it through `configureOutput`, D4), and when the raw
      argv carries `--json` (D5) emit one envelope through `createReporter(env.io, true)` built by
      `buildEnvelope` with `ExitCode.Usage`, the resolved command path, and a single finding
      `{ code: 'cli.usage', severity: 'error', message, details: { commander_code } }`. The message is
      commander's own with any leading `error: ` removed; the commander code is its `commander.`
      prefix removed (D3).
- [x] 2.2 Same file: the catch's comment states that the envelope is built here rather than routed
      through `runCommand`, and why — a parse failure has no command body to wrap (D1).
- [x] 2.3 `test/unit/run-usage-errors.test.ts`: drive `run()` with a fake env and assert, for an
      unknown option — exit code is `Usage`; stdout is empty without `--json`; stdout parses as one
      envelope with `--json`, carrying `status: 'error'`, `exit_code: 2`, `command: 'session.start'`,
      and one `cli.usage` finding whose details name the commander code; stderr carries the message
      exactly once in BOTH modes. Repeat for excess arguments and for an unknown command.
- [x] 2.4 Same file: `--help` and `--version` still exit 0 and still write no envelope (D5, and the
      non-goal it follows from).
- [x] 2.5 `npx vitest run test/unit/run-usage-errors.test.ts` green.

## 3. Verification

- [x] 3.1 `npm run typecheck` and `npm run build` clean.
- [x] 3.2 `npm test` green — including `json-envelope-conformance` and `cli-name`, which exercise the
      same catch.
- [x] 3.3 Exercised against the built CLI: `ctxr session start --slug x --json` exited 2 with one
      envelope on stdout (`command: "session.start"`, one `cli.usage` finding naming
      `unknownOption`) and exactly one line on stderr; the same invocation without `--json` wrote
      nothing to stdout and one line to stderr; `ctxr publish new my-page --bogus --json` reported
      `publish.new`, not the slug; `ctxr --help` and `ctxr --version` were unchanged.
- [x] 3.4 `openspec validate parser-errors-answer-in-the-envelope --strict` exits 0.
