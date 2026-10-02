## Context

See proposal.md — Why. The shape of the fix is constrained by where the failure happens:

- `runCommand` (`src/run.ts:79-128`) is the one place that builds an envelope, and it wraps a
  command's body. A parse failure happens before any body is chosen, so it cannot pass through there
  without inventing a command to run.
- `createReporter` (`src/core/reporter.ts`) is the only object permitted to write to stdout, and a
  guard test enforces that for `src/commands/**`. Whatever emits the envelope here goes through it.
- `buildEnvelope`/`statusForExitCode` (`src/core/envelope.ts`) already handle `ExitCode.Usage`,
  mapping it to the `error` status. Nothing new is needed to describe a usage error; the path simply
  never reaches the builder.
- commander has already written its own message by the time it throws: `error()` writes through
  `configureOutput.writeErr` and then calls the `exitOverride` callback, which throws. That is why the
  catch's own write is a duplicate rather than the only output.

## Goals / Non-Goals

**Goals:**

- A caller that asked for `--json` gets a parseable answer on stdout for every failure it can cause by
  mistyping a command line.
- One human line per failure, on stderr, in both modes.
- The envelope names what was asked for, so a caller can correlate the answer with its request.

**Non-Goals:**

- An envelope for help or version output. See proposal.md Non-goals.
- Any change to how a command's own `ContextureError` is reported; that path already works.

## Decisions

### D1 — The envelope is built in `run()`'s catch, not routed through `runCommand`

`runCommand` exists to wrap a command body and needs a command name and a body to call. A parse
failure has neither. Routing through it would mean inventing a no-op body so that the wrapper could
catch a thrown error it did not raise, which reads as indirection for its own sake.

The catch instead builds the envelope directly with the same `buildEnvelope` and the same `Reporter`
every command uses, so the shape cannot drift from a command's. What it does not share is the
try/catch, which is the part that does not apply.

### D2 — The `command` field names the deepest registered command the argv reached

`ctxr session start --slug x --json` reports `session.start`. `ctxr sessoin start --json` reports the
empty string, because `sessoin` is not a registered command and nothing under it can be either.

Resolved by walking the registered command tree — matching each leading argv token against the
subcommands registered at that level, stopping at the first token that is not one — rather than by
reading argv positionally. Positional reading would be wrong in exactly the case it matters:
`ctxr publish new my-page --bogus` would report `publish.new.my-page`, naming a page slug as though it
were a command.

The alternative, reporting an empty command for every parse failure, was rejected: a caller running
several commands concurrently against one log has nothing to correlate the answer with, and the field
would be uniformly empty precisely when the caller is least sure what happened.

### D3 — One finding code, with commander's own code in details

The finding is `cli.usage` in every case, with `details.commander_code` carrying `unknownOption`,
`excessArguments`, `unknownCommand`, and so on.

Mapping each of commander's codes onto a contexture code was considered and rejected. It would put a
dependency's internal vocabulary into contexture's public output contract, where a commander upgrade
that adds or renames a code becomes either a silent gap or a breaking change to an envelope field. A
single stable code plus the raw detail lets a caller switch on the specific case without contexture
promising to track that vocabulary forever.

`cli.usage` rather than `usage.error` or `parse.error`: the existing codes name their subject first
(`root.not_found`, `publish.slug_exists`, `session.name_exists`), and the subject here is the command
line itself.

### D4 — commander's write is the one human line

The catch stops writing `err.message`. The message the caller sees is the one commander wrote through
`configureOutput.writeErr`, which this program already routes to stderr.

The opposite fix — suppressing commander's write and keeping contexture's — was considered. It is
worse: commander writes usage hints and suggestions alongside the message on some paths, and
intercepting `writeErr` to filter them would mean parsing a dependency's output to decide what to
keep.

Help and version keep their early return, so neither pays for this.

### D5 — `--json` is read from raw argv here

No parse completed, so `optsWithGlobals` has nothing to report. The catch reads `--json` from the argv
it was handed, the same way `isGlobalVersionRequest` already does for the version flags
(`src/run.ts:150-153`).

This is a narrow reading and deliberately so: it recognizes the flag's exact spelling, and a caller
who wrote `--jso` gets the human line and an unknown-option error, which is the correct answer to what
they typed.

## Risks / Trade-offs

- **A caller parsing stderr for the duplicate line.** Anything counting `error:` lines to detect a
  failure would now count one where it counted two. Failure is still signalled by the exit code, which
  does not change, and by the message itself, which is unchanged.
- **stdout becomes non-empty for a case where it was empty.** A caller that treated empty stdout as
  "the parse failed" now gets JSON instead. That caller was reading the absence of an answer as an
  answer; the exit code said the same thing and still does.
- **`command` may name a command that never ran.** Deliberate: the field reports what was asked for,
  which is what a caller correlates against. The `error` status and the usage exit code are what say
  it did not run.
