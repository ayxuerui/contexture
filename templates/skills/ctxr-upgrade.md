Upgrade the installed `ctxr` to the latest published release, then bring this store's
contexture-owned files up to it. `ctxr-session-lifecycle` offers this skill at the start of a session
when a newer release is published; it is equally valid to run it directly.

Upgrading replaces the executable for every store on this machine, not only this one. That is why
step 3 gates on the operator rather than proceeding from the fact that a newer release exists.

1. Read the live answer — never act on a notice from earlier in the conversation, which may be
   minutes stale: `ctxr version --check --json`. The envelope's `data` carries `version` (installed),
   `latest` (published), `release_status`, `install_path`, and `install_kind`. Exit code `0` means
   already current: say so and stop. A non-zero exit with `release_status` of `undetermined` means the
   published version could not be resolved — report the reason the finding names, and stop; do not
   guess whether an upgrade is due.

2. Check `install_kind` before proposing anything.
   - `global` — proceed to step 3.
   - `linked` — this executable resolves to a working copy at `install_path`, not a package
     installation. A global install would upgrade a different `ctxr` than the one running. Report the
     path and stop.
   - `undetermined` — the executable is inside a `node_modules` that is not the global one: a project
     dependency, or an `npx` invocation. Report `install_path` and stop; upgrading it is the
     operator's call about that project, not a global install.

3. Gate on the operator. Name the installed version, the published version, and `install_path`, and
   ask whether to upgrade. Wait for an explicit go. Having approval for the session's other work is
   not approval for this — it changes software outside the store.

4. Upgrade, then confirm: `npm install -g ctxr-cli@latest`, then `ctxr version`. Confirm the reported
   version is the published one before continuing. If it still reports the old version, the shell is
   resolving a different `ctxr` than the one npm wrote — report that and stop rather than continuing
   into step 5, where the re-render would be performed by the executable you just tried to replace.

5. Re-render this store with the upgraded executable, in that order — the generated files come from
   the binary, so re-rendering first would only rewrite them at the old version. Work in a session
   worktree (`ctxr session start`), never the root checkout: `ctxr update` writes contexture-owned
   files, and those writes land through a reviewed pull request like any other change.

6. Land the re-render as its own pull request. `ctxr update` produces generated-file churn — AGENTS.md
   sections, skill copies, hooks, adapter outputs — and mixing it into unrelated work makes both
   harder to review. Follow `ctxr-submit`, then `ctxr-land`.

If step 4 or 5 fails, say which step and what the command reported. A partial upgrade — new executable,
un-re-rendered store — is a real state worth naming: the store still works, and step 5 can be re-run on
its own at any time.
