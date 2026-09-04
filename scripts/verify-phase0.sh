#!/usr/bin/env bash
# Runs task 0.9's literal verification command line, plus a full test run,
# and reports real output rather than asserting a check passed without
# having run it (openspec/config.yaml's apply guidance).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Build"
npm run build

echo "==> Typecheck"
npm run typecheck

echo "==> Full test suite (unit + integration, including the real-pty test)"
npm test

echo "==> Task 0.9's literal command line"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
export GIT_AUTHOR_NAME="verify-phase0" GIT_AUTHOR_EMAIL="verify-phase0@example.com"
export GIT_COMMITTER_NAME="verify-phase0" GIT_COMMITTER_EMAIL="verify-phase0@example.com"
CONTEXTURE_STORE_ROOT="$TMP_ROOT" node dist/bin.js init </dev/null
CONTEXTURE_STORE_ROOT="$TMP_ROOT" node dist/bin.js doctor
echo "OK: contexture.yaml declares:"
grep -A1 "profile:" "$TMP_ROOT/contexture.yaml" || true

echo "==> All Phase 0 checks passed"
