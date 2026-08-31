# Contexture (`ctxr`)

The structured context platform for the organization — a context store that ingests, organizes, and retrieves context for any AI agent harness (Claude Code, Codex, Cursor, Cline, Gemini CLI, a cron job, a human at a terminal).

## Install

```sh
npm install -g ctxr-cli
```

The npm package is `ctxr-cli`, the executable it installs is `ctxr`, and the project is Contexture. Everything a store contains keeps the project name — `contexture.yaml`, the `.contexture/` home directory, `CONTEXTURE_*` environment variables — while `ctxr` is what you type. A `contexture` alias executable is also installed for compatibility; docs and generated files always say `ctxr`.

## Usage

```sh
ctxr init                 # create a store (or reconcile an existing one)
ctxr doctor               # check the store's invariants
ctxr catalog show         # the curated index of retrievable notes
ctxr graph build          # rebuild the wikilink graph
ctxr graph query hubs     # ...and query it
ctxr session start        # every write lands via a session worktree and a PR
ctxr --help               # the full command list
```

Every command accepts `--root <path>` (or `CONTEXTURE_ROOT`) and `--json`.
