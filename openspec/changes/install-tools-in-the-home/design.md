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

### D4. The global prefix is npm's answer, asked only when Node's prefix does not settle it

`classifyInstallPath` keeps its pure first step: a path under Node's own prefix is `global`, a path
with no `node_modules` is `linked`. For anything else under a `node_modules`, it consults npm's
configured global prefix: `NPM_CONFIG_PREFIX` or `npm_config_prefix` from the environment if set,
else the output of `npm prefix -g` (bounded by a short timeout; a failure leaves the answer
`undetermined`). A path under `<prefix>/lib/node_modules` (POSIX) or `<prefix>/node_modules`
(Windows) is `global`, and `install_writable` checks that root and `<prefix>/bin` rather than
Node's directory.

*Environment only, steelmanned:* reading `NPM_CONFIG_PREFIX` alone keeps the classifier pure and
spawns nothing, and it covers the runtime image. But it misses the case npm documents as *the* fix
for EACCES, `npm config set prefix`, which writes `~/.npmrc` and sets no variable. Parsing npmrc
files ourselves (user, global, builtin, project, with `${VAR}` expansion) reimplements npm's
config resolution and would drift from it.

*Always ask npm, steelmanned:* one code path, always npm's own answer. But it adds a process spawn
to every `ctxr version`, including the bare one, for the common case Node's prefix already settles.
Asking only when the cheap answer is `undetermined` costs nothing on the common path.

The question being answered is "would `npm install -g` replace this executable?", and npm is the
authority on where `npm install -g` writes, so where it is consulted its answer wins.

## Risks / Trade-offs

- **A session upgrade can outrun `serve`.** In the runtime image the agents' `ctxr` is in the home
  and `serve` runs the image's. contexture-images guards its own daily update against a release
  whose store schema is above the image's ctxr. `ctxr-upgrade`'s `npm install -g ctxr-cli@latest`
  does not: a session could install a release that migrates the store's schema past what `serve`
  reads. The schema has been 10 from 0.20.0 to 0.34.0, so this is rare, and this change does not
  address it. See the open question.
- **`AGENTS.md` size.** Two bullets, no example block.

## Open Questions

- Should `ctxr version --check` (and so `ctxr-upgrade`) honor a schema ceiling the environment
  declares, for example a `CONTEXTURE_SCHEMA_CEILING` the runtime image sets to its own ctxr's
  `SUPPORTED_SCHEMA_VERSION`, reporting the newest release at or below it? It would close the risk
  above at the cost of a deployment-shaped variable in core. Left for a separate change if wanted.
