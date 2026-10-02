## Why

Two defects sit on the same code path — `run()`'s catch around `program.parseAsync`
(`src/run.ts:663-673`) — and both surface at the moment a caller has just made a mistake.

A usage error prints twice. commander writes the message itself, through the `configureOutput` hooks
this program installs (`src/run.ts:170-173`), and then throws; the catch writes `err.message` a second
time. An agent capturing `2>&1` reads two identical `error: unknown option '--slug'` lines and has no
way to tell one failure reported twice from two failures.

A usage error under `--json` emits no envelope at all. commander throws out of `parseAsync` before any
command is selected, so `runCommand` — the one place that builds an envelope — never runs. stdout is
empty, and a caller that asked for machine-readable output and parses stdout gets nothing back, for
the one class of failure it caused itself and could correct. The cli-contract spec says stdout parsed
as JSON "succeeds and yields the command's full result", and `statusForExitCode` already maps
`ExitCode.Usage` to the `error` status (`src/core/envelope.ts:49`) — a status this path can never
reach today.

The two are worth fixing together because they are the same decision seen twice: what a usage error
owes a caller on each stream. One human line on stderr, one envelope on stdout when asked for.

This came up while implementing `name-the-session-at-start`, whose own proposal named both as
deliberately out of scope: they belong to argv parsing in general rather than to session naming.

## What Changes

- A usage error detected during argument parsing emits the standard envelope on stdout when `--json`
  was requested, with the usage exit code, `error` status, and one finding.
- The finding's code is `cli.usage`, and its details carry commander's own error code, so a caller may
  distinguish an unknown option from excess arguments without contexture maintaining a translation of
  another library's vocabulary.
- The envelope's `command` field names the deepest registered command the argv actually reached —
  `session.start` for a bad flag on `ctxr session start` — resolved by walking the registered command
  tree rather than by reading argv positionally.
- The catch no longer re-writes the message commander has already written. The human line appears
  exactly once, on stderr, in both modes.
- `--json` mode is read from the raw argv on this path, since no parse completed to read it from.

Nothing about a successful command changes, and no command's own error handling is touched: every
`ContextureError` already reaches `runCommand` and already produces an envelope.

## Capabilities

### New Capabilities

None. The change lands on the existing `cli-contract` capability.

### Modified Capabilities

- `cli-contract`: the `--json` envelope requirement extends to a usage error raised before any command
  is selected, and a new requirement states that such an error is reported once on stderr. The exit
  code taxonomy, the fail-loud contract, and the executable-naming requirements are untouched.

## Non-goals

- **An envelope for `--help` and `--version`.** Both already have deliberate handling — help is routed
  to stderr so parser chatter cannot contaminate `--json` stdout, and a bare version query is
  intercepted ahead of parsing precisely so it emits one envelope on stdout (`src/run.ts:135-152`).
  Neither is a command's result, and wrapping help text in an envelope would invite parsing it.
- **Translating commander's error codes into a contexture vocabulary.** A mapping table would have to
  track a dependency's internal names across upgrades; the raw code in `details` costs nothing and
  cannot drift. Argued in design.md D3.
- **Replacing commander's message with contexture prose.** Its messages are accurate and name the
  offending token; rewriting them would be a second vocabulary for the same failures.
- **Suggesting a correction** ("did you mean `--json`?"). commander already offers its own suggestions
  when a token is close enough to a real one; a second guesser is out of scope here.
- **Changing how a non-commander throw out of `parseAsync` is handled.** It is rethrown today, which is
  right: that is a bug, not a usage error, and it should reach the caller as one.
