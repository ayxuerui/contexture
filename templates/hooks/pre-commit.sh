#!/bin/sh
# Installed by `ctxr init` (write-lifecycle spec). Version-controlled —
# do not edit by hand; re-run `ctxr init` or `ctxr doctor` to
# regenerate. Runs `doctor --staged` against the exact contexture install
# that wrote this hook, and refuses the commit if it finds a real problem.
set -eu

CONTEXTURE_BIN="__CONTEXTURE_BIN__"

if [ ! -f "$CONTEXTURE_BIN" ]; then
  echo "ctxr: warning — could not find $CONTEXTURE_BIN; skipping pre-commit validation." >&2
  exit 0
fi

if ! output=$(node "$CONTEXTURE_BIN" doctor --staged --json 2>&1); then
  echo "$output" >&2
  echo "ctxr: commit refused — staged changes failed 'doctor --staged'." >&2
  exit 1
fi

exit 0
