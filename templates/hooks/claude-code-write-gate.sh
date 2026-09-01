#!/bin/sh
# Installed by `ctxr adapters generate` / `ctxr update` (adapters spec). Version-
# controlled — do not edit by hand; re-run to regenerate. A PreToolUse hook:
# relays the tool-call envelope on stdin to `ctxr adapters write-gate`, which
# decides whether to deny it, and relays its stdout and exit code unchanged.
set -eu

CONTEXTURE_BIN="__CONTEXTURE_BIN__"

if [ ! -f "$CONTEXTURE_BIN" ]; then
  echo "ctxr: warning — could not find $CONTEXTURE_BIN; skipping write-gate check." >&2
  exit 0
fi

node "$CONTEXTURE_BIN" adapters write-gate
