# --- shared: resolve the ctxr CLI ------------------------------------------
# Authored in templates/hooks/_resolve-ctxr.sh and inlined verbatim into every
# hook that needs it at render time (src/core/hooks.ts) — one copy of a
# security decision, never two that can drift apart. Do not edit the inlined
# copy; re-run `ctxr init` / `ctxr update` to regenerate it.
#
# Resolves at RUN time, so the rendered hook is byte-identical in every
# checkout of this store: a path baked in when the file was generated is
# valid only on the machine that generated it, and this file is committed.
#
# Order: $CONTEXTURE_BIN, then `ctxr` on PATH. Nothing else is consulted, and
# there is no "give up and continue" branch — when neither resolves, this
# calls ctxr_unavailable <reason>, which each hook defines above and which
# must not return. A CONTEXTURE_BIN that is set but broken is terminal: it is
# a deliberate pin, and silently running a different binary instead would
# defeat the operator who set it.
#
# Leaves the resolved command in the positional parameters ("$@"). Neither
# hook that inlines this reads its own arguments.
if [ -n "${CONTEXTURE_BIN:-}" ]; then
  if [ ! -f "$CONTEXTURE_BIN" ]; then
    ctxr_unavailable "CONTEXTURE_BIN names a path that is not a file: $CONTEXTURE_BIN"
  elif [ -x "$CONTEXTURE_BIN" ]; then
    set -- "$CONTEXTURE_BIN"
  elif command -v node >/dev/null 2>&1; then
    # A plain dist/bin.js: tsc emits it non-executable, and only npm's
    # bin-linking sets the bit, so a dev checkout needs node to run it.
    set -- node "$CONTEXTURE_BIN"
  else
    ctxr_unavailable "CONTEXTURE_BIN is not executable and no node is on PATH to run it: $CONTEXTURE_BIN"
  fi
elif command -v ctxr >/dev/null 2>&1; then
  set -- ctxr
else
  ctxr_unavailable "no ctxr on PATH, and CONTEXTURE_BIN is not set"
fi
# --- end shared: resolve the ctxr CLI --------------------------------------
