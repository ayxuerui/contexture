#!/bin/sh
# Installed by `ctxr init` (write-lifecycle spec). Version-controlled —
# do not edit by hand; re-run `ctxr init` or `ctxr doctor` to
# regenerate. Runs `doctor --staged` with the ctxr this machine resolves at
# run time, and refuses the commit if it finds a real problem — or if it
# could not run that validation at all.
set -eu

# A commit this hook could not check is refused, not passed: the point of the
# hook is that no unvalidated change is committed, and "ctxr is not installed
# here" is not evidence that the staged diff is clean.
ctxr_unavailable() {
  echo "ctxr: commit refused — $1" >&2
  echo "ctxr: this hook validates staged changes with 'ctxr doctor --staged', and will not pass a commit it could not check." >&2
  echo "ctxr: install the CLI with 'npm install -g ctxr-cli', or set CONTEXTURE_BIN to its dist/bin.js." >&2
  echo "ctxr: 'git commit --no-verify' bypasses this hook if you must commit before repairing the install." >&2
  exit 1
}

__RESOLVE_CTXR__

if ! output=$("$@" doctor --staged --json 2>&1); then
  echo "$output" >&2
  echo "ctxr: commit refused — staged changes failed 'doctor --staged'." >&2
  exit 1
fi

exit 0
