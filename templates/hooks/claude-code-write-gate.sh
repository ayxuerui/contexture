#!/bin/sh
# Installed by `ctxr adapters generate` / `ctxr update` (adapters spec). Version-
# controlled — do not edit by hand; re-run to regenerate. A PreToolUse hook:
# relays the tool-call envelope on stdin to `ctxr adapters write-gate`, which
# decides whether to deny it, and relays its stdout and exit code unchanged.
# Carries no path specific to the machine that generated it — `ctxr` is
# resolved at run time, and an edit this gate could not evaluate is denied,
# not allowed unchecked.
set -eu

# The write gate is an enforcement primitive, and a gate that cannot run is
# not a passing decision (adapters spec). This speaks the same PreToolUse deny
# protocol `ctxr adapters write-gate` does — a JSON body on stdout, exit 0 —
# because that is the only vocabulary the harness reads as "denied, and here
# is why". A nonzero exit other than 2 is reported as a hook error and the
# edit proceeds, which is the failure this replaces; exit 2 hard-blocks
# regardless of output and would conflate a broken install with a decision.
ctxr_unavailable() {
  # Drain the envelope the harness is writing to us before exiting: the
  # normal path reads stdin to EOF via `ctxr adapters write-gate`, and a
  # harness that writes the full envelope before checking our exit code
  # would otherwise see its own write fail (EPIPE/SIGPIPE) once we exit
  # without ever reading it.
  cat >/dev/null 2>&1 || true
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"contexture: the write gate could not run (%s), so this edit is denied rather than allowed unchecked. Install the CLI (npm install -g ctxr-cli) or set CONTEXTURE_BIN to its dist/bin.js, then retry."}}\n' "$1"
  exit 0
}

__RESOLVE_CTXR__

# Not `exec`: a resolved command can still fail to execute (a broken symlink,
# a non-executable file found on PATH), and exec's 126/127 would reach the
# harness as an ordinary hook error — fail-open, the bug this file exists to
# close. Every other exit code and all of stdout are relayed unchanged, so the
# gate's own deliberate "I could not decide, apply normal permission flow"
# exits (never 2) keep their documented meaning.
status=0
out=$("$@" adapters write-gate) || status=$?
if [ "$status" -eq 126 ] || [ "$status" -eq 127 ]; then
  ctxr_unavailable "the resolved ctxr could not be executed (exit $status)"
fi
printf '%s' "$out"
exit "$status"
