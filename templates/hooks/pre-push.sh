#!/bin/sh
# Installed by `ctxr init` (write-lifecycle spec). Version-controlled —
# do not edit by hand; re-run `ctxr init` or `ctxr doctor` to
# regenerate. Refuses any push whose remote ref is this store's default
# branch — every write lands via a session and a reviewed pull request.
set -eu

if [ "${CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH:-}" = "1" ]; then
  exit 0
fi

DEFAULT_BRANCH="__DEFAULT_BRANCH__"
BLOCKED_REF="refs/heads/$DEFAULT_BRANCH"

while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "$BLOCKED_REF" ]; then
    echo "ctxr: push refused — '$DEFAULT_BRANCH' is this store's default branch." >&2
    echo "ctxr: land your work via a pull request instead (see the ctxr-submit skill)." >&2
    echo "ctxr: emergency override: CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH=1 git push ..." >&2
    exit 1
  fi
done

exit 0
