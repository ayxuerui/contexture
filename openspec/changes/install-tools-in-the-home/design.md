## Context

contexture-images moved every harness and tool out of the image and into the agent's home, each
installed by its publisher's own installer, with `NPM_CONFIG_PREFIX=/home/agent/.local` so
`npm install -g` works as the agent. The whole home is backed up. That deployment is one of many:
stores also run from a laptop's Claude Code or Codex, where the home is the operator's and npm's
prefix may be root-owned. contexture's shipped text has to be right in both.

## Goals / Non-Goals

**Goals:**

- `ctxr version` tells the truth about a global install under a user prefix.
- One rule, true on any machine, for where an agent installs a tool.
- The upgrade skill's dead end names the fix instead of only the cause.

**Non-Goals:**

- Configuring a prefix, PATH or installer for the agent. contexture renders text; the environment
  provides the prefix.
- A tool inventory or manifest in the store. A tool belongs to the machine; what the store's work
  depends on is already recorded in notes and skills.

## Decisions

### D1. The rule is environment-neutral: "your home, your user, the publisher's installer"

The rule does not name `~/.local`, `NPM_CONFIG_PREFIX` or a container. It names the property that
makes an install safe everywhere: the running user's own home, with the installer its publisher
documents.

*Against, steelmanned:* the runtime image is where agents install most, and a rule that said
"`npm install -g` goes to `~/.local`" would be concrete and checkable. But stated in contexture it
is false on a laptop whose prefix is `/usr/local` and writable by the operator, and it binds core
text to one deployment's layout, which the baseline spec forbids ("never a shipped profile's or one
deployment's names"). The check an agent can run anywhere is `npm config get prefix`, so the rule
names that.

### D2. Escalation is ruled out by name

The rule says "never with `sudo`" rather than "as your own user" alone. An agent that hits EACCES
reliably proposes `sudo` next; naming it closes that path in one word.

*Against:* a convention that lists prohibitions invites a list of them. Accepted for this one: it is
the single escalation every package manager's error message suggests.

### D3. The upgrade skill still stops on an unwritable install; it does not switch the prefix

The skill could run `npm config set prefix ~/.local` and retry. It does not: that changes the
machine's npm configuration for every later install and needs a PATH change the skill cannot make
for the operator's shells. It names the remedy and stops, as it does for a linked working copy.

*Against:* stopping leaves the store on the old version until a person acts, and the runtime image
shows the user prefix is the right answer. But the runtime image already sets the prefix, so its
agents never reach this branch. The branch is reached only where the operator chose the layout,
and changing it is theirs.

### D4. "Global" means "inside the prefix `npm install -g` writes to", and npm says where that is

The question the upgrade skill needs answered is: would `npm install -g ctxr-cli` replace the
executable that is running? Today ctxr answers a different one -- is it under Node's own prefix? --
and is wrong both ways:

1. ctxr under a user prefix (`~/.local`, `~/.npm-global`) reports `undetermined`, and the skill
   refuses an upgrade that would work. This is the runtime image's case.
2. ctxr under Node's prefix while npm is configured to write elsewhere reports `global`, and the
   upgrade installs a second copy instead of replacing the first. Step 4's on-PATH check notices
   only after the second copy exists.

So the classifier asks npm first. The prefix is `NPM_CONFIG_PREFIX` or `npm_config_prefix` when
either is set, otherwise the output of `npm prefix -g`, bounded by a short timeout. A path under
that prefix's global package root (`<prefix>/lib/node_modules` on POSIX, `<prefix>/node_modules` on
Windows) is `global`, and `install_writable` checks that root and `<prefix>/bin`. A path in a
`node_modules` outside it is `undetermined`, whatever Node's prefix says. Node's own prefix is used
only when npm cannot be asked (not on PATH, failed, timed out), which keeps today's behavior there.
A path with no `node_modules` stays `linked`.

*In the skill instead, steelmanned:* the skill could run `npm prefix -g` and compare paths itself:
no code, smaller change. But the comparison would live in markdown no test reaches, which is why
the CLI reports `install_kind` at all (the earlier change's D12), and only this skill would get it
right; every other caller of `ctxr version` would keep the wrong answer.

*Environment only, steelmanned:* reading `NPM_CONFIG_PREFIX` alone spawns nothing and covers the
runtime image. It misses npm's own documented EACCES fix, `npm config set prefix`, which writes
`~/.npmrc` and sets no variable. Parsing npmrc files (user, global, builtin, project, `${VAR}`
expansion) would reimplement npm's config resolution and drift from it.

*Cost:* one `npm` process (a few hundred milliseconds) when the variable is unset. Only the install
classification needs it, which `ctxr version` computes alongside a registry call to npm already;
nothing on the session or update paths does.

## Risks / Trade-offs

- **A session upgrade can take a ctxr ahead of the store's schema.** `ctxr-upgrade` installs
  `ctxr-cli@latest`; when that release raises the schema, the store is refused until its migration
  pull request merges. This is the same risk a deployment that updates ctxr on a schedule takes
  (contexture-images' runtime image does, in both its agents and `serve` containers), and it is
  accepted there and here: schema-raising releases are rare (10 from 0.20.0 to 0.34.0), the fix is
  merging one pull request, and the skill already re-renders the store through a pull request in
  its own steps. A schema ceiling the environment declares was considered and declined; if it is
  ever wanted, the limit belongs to the store's readers, not to one environment.
- **`AGENTS.md` size.** Two bullets, no example block.
