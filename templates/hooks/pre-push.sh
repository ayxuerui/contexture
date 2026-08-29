#!/bin/sh
# Installed by `contexture init` (write-lifecycle spec). Version-controlled —
# do not edit by hand; re-run `contexture init` or `contexture doctor` to
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
    echo "contexture: push refused — '$DEFAULT_BRANCH' is this store's default branch." >&2
    echo "contexture: land your work via a pull request instead ('contexture session submit')." >&2
    echo "contexture: emergency override: CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH=1 git push ..." >&2
    exit 1
  fi
done

exit 0
