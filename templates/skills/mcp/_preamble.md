## Before this skill: the store's tools stand in for a checkout

### In a checkout, use the store's own skill

If the working directory has a `contexture.yaml` at its root and a shell here runs `ctxr`, you are in a
checkout of the store, and this text is not for you. The `contexture:`-namespaced skills and commands, such as
`contexture:ctxr-capture` and `/contexture:capture`, are this plugin's, written for the store's server. The
un-namespaced `ctxr-<name>` skills in the store's skills folder are the store's own, written for a checkout.
In a checkout, invoke the un-namespaced `ctxr-<name>` skill of the same name and follow it, never the
`contexture:` one, and ignore the rest of this text. A `/contexture:` command typed in a checkout asks for that store
skill.

### Through the store's server

Otherwise you are working through this store's server, not in a checkout of it. Nothing runs a shell here, so no
`git`, `gh` or `ctxr` command runs as written. The skill below was written for an agent with a checkout:
follow it as written, and take each step it names through the tool these tables give.

### Commands

__COMMAND_TABLE__

A command marked none has no counterpart here: skip that step and say nothing about it. Each other tool takes its command's options as fields, each named for its option without the leading
dashes, and the session the command names as `session`: the session worktree's directory name, which
`session_start` returns and `session_list` lists. `session_start` takes the session's name as `label`.

Every other `ctxr` step runs through the `ctxr` tool when the command only reads, and through `ctxr_write`
when it writes. Pass the words after `ctxr` as `args`, one word per entry: a step that says to run
`ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`. Name a session as `session` to run the command
in that session's working tree; `ctxr_write` always needs one. When a command reads a file you prepared,
pass the file's text as `input` and write `@input` in `args` where its path goes.

### Git steps

__GIT_STEP_TABLE__

Commits, pushes and pull requests happen only in `session_submit`. A step marked none is the server's own
work: it keeps the store's clone current, and `session_start` branches from the freshly fetched default
branch. Skip that step and say nothing about it.

### Paths

`session_start` returns the session's root, a path such as `__WORKTREES_PATH__<directory>/`. Every path the
skill names is relative to the store; inside a session it goes under that root, so the note `work/a.md` in
that session is `__WORKTREES_PATH__<directory>/work/a.md` for `Read`, `Edit`, `Write`, `Move`, `Delete`,
`Grep` and `Glob`. A path without a session root reads the store as it was last approved, and a write to one
is refused. A change rests uncommitted in its session until `session_submit`.

### This store's settings

Where the skill uses one of this store's settings, it names the setting with a placeholder in angle
brackets, such as `<inbox path>`, `<log path>` or `<default branch>`. The connector's instructions give each
one's value under *This store*, by the same name, with the store's layers and its relation vocabulary. Use
that value wherever the placeholder appears, inside a path too: `<capture root>assets/` with a capture root
of `sources/` is `sources/assets/`. Other words in angle brackets, such as `<path>`, `<title>` or `<session>`, are
yours to fill as the step says. If the instructions are not in front of you, AGENTS.md states most of these
values; for one it does not state, ask the person rather than guess.

### More than one contexture connector

Someone in several stores has one connector per store, and each one's instructions name its own store and
values. Use the connector of the store the person names, with that store's values, and ask when it is unclear
which store they mean. A session, a path or a value from one store's connector never goes to another's.

### A step this connector does not offer

The skills update when contexture releases, and a store's server can run an older ctxr: *This store* gives
the version it runs. When a step names a tool the connector does not list, or the `ctxr` or `ctxr_write`
tool refuses a command the step names as one it does not run, tell the person that this store's server runs
an older ctxr, then skip that step or take the nearest step the connector does offer. Never improvise a
replacement for a step that writes.

### Sessions across conversations

The server keeps a session between conversations, but it cannot tell two conversations apart. At the
start of a conversation, call `session_list` and mention each open session: what it holds uncommitted,
and any requested changes on its pull request. Work in the session the person names, or start one.

Where the skill hands off to a skill this environment does not carry, such as landing or upgrading, or
asks you to work inside a store mounted under `shared/`, that step is not yours here: a person lands an approved change from the store's approval page.
