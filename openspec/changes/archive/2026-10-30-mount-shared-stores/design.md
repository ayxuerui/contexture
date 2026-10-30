## Revisions after critique

A three-model critique (2026-10-22, all three APPROVE_WITH_CHANGES) changed the following. These override anything
inconsistent below.

1. **The mount location is fixed at `shared/<name>/`.** The configurable `path` was dropped. All three reviewers
   flagged it: path links carry the prefix into note content, so a per-store setting would make the same link mean
   different things, and every check would have to follow it.
2. **The ignore entry goes in the repository's local exclude file, not a tracked `.gitignore`.** If sync wrote a
   tracked file outside a session, the canonical clone would have uncommitted changes, which blocks its own
   fast-forward. The exclude file is shared by all worktrees. The `doctor` check stays the enforcement.
3. **Sharing settles the moved note's outgoing links first** (D9), **and `lint` in the mounting store reports a
   shared note that links to one of the mounting store's notes.** Owning-store resolution stops such a link from
   resolving. It does not stop the link text from naming a private note to every reader.

**Considered and not taken:** dropping the merged graph, so that each store resolves strictly within itself and
retrieval queries each mount's own artifacts. It was rejected for two reasons:
- The edges from personal notes into shared notes exist only in the mounting store's notes, so per-mount graphs
  cannot represent them.
- A mount's graph cache is ignored by git, so a fresh clone has no graph of its own to query. Something would build
  it either way.

## Context

See proposal.md for why. The constraints that shape the approach:

- **A git clone discloses everything in it.** Every blob sits in `.git/objects`, readable with `git cat-file`
  whatever the working-tree file modes or harness deny rules say. Claude Code's `Read()` deny rules do not cover
  arbitrary subprocesses. Its OS sandbox and Codex's `"none"` profiles do, but are defeated by the object store.
  Git's own `gitnamespaces` documentation: "If you have private data… your best option is to store it in another
  repository."
- **No mature git tool enforces per-path read permission.** Josh, a proxy that serves filtered views of a
  repository, closed its per-user permission work unmerged twice, most recently in November 2025. git-crypt leaks
  paths, sizes, timing and commit messages, and cannot revoke. GitHub, GitLab and Gitea grant read access per
  repository only; GitLab issue #6051 asking for more is open.
- **Products converged on the container as the unit of sharing:** 1Password vaults, Bitwarden organizations, Tana
  and Anytype workspaces, and Google Drive's September 2025 change that removed restrictions on individual items
  inside a shared folder. Bitwarden renamed "Share" to "Move to organization".
- **Every multi-user AI system with real isolation binds an agent session to one person:** LangGraph's
  authenticated store namespaces, Khoj per user, ChatGPT's shared projects turning personal memory off. A shared
  agent accumulates the union of everyone's access (the Slack AI and EchoLeak incidents leaked through retrieval
  that was correctly permission-trimmed).
- **Hermes, the harness the stores run in, has no per-user isolation.** Its allowlist decides who may talk to a
  gateway; its memory belongs to a profile. Two people need two profiles and two containers.
- **The code today:** wikilinks resolve by filename stem only (`src/core/graph/model.ts`), and note enumeration
  walks every directory not excluded (`src/core/notes/list.ts`), so a clone placed inside a store today would be
  read as the store's own notes, with its `.contexture/` and `.agents/` included. Root resolution lets
  `CONTEXTURE_STORE_ROOT` win over a different repository found from the working directory.

## Goals / Non-Goals

**Goals:**
- Make the repository the only privacy boundary, and make it cheap to have several: one personal store per person
  and one store per group, with a person's checkout holding exactly the stores that person may read.
- Keep every existing single-store behavior byte-identical for a store that declares no mounts.
- Keep a mounted store autonomous: its configuration, exclusions, write lifecycle, review and approval are its own,
  wherever it is mounted.
- Make a link's resolution independent of whose checkout it is read in.

**Non-Goals:** see the proposal's Non-goals. At the design level, additionally: the CLI does not decide who may
clone what. That is the forge's repository access and the credentials each person's container holds, provisioned
outside this repository.

## Decisions

### D1. A store has one audience; privacy between people is a store boundary

Everyone who can read a store can read all of it. A note private to one person lives in a store only that person's
agent can clone.

**Case for access control inside one store:** one repository is one history, one configuration, one `serve`, one
review queue. Sharing is a rename in one commit, not a move across two repositories. At twenty people, named groups
become folders rather than thirty to forty repositories. A server that holds the only clone and hands each person a
filtered view, the way Subversion's path authorization or gbrain's per-client source grants do, enforces this for
real, and a local trial of gbrain showed zero leaks across about 320 scoped calls.

**Why a store boundary anyway:**
- Every per-path mechanism in a git repository is either advisory (labels, deny rules), leaky (git-crypt's paths and
  messages), or a custom server we would own and must get exactly right across every output: views, catalog,
  graph, rollups, diffs, logs. gbrain, with a database enforcing it, still logged several leak fixes and backed off
  a "zero leaks" claim.
- One mistake in one repository exposes one audience, not everyone. A wrong collaborator, a leaked key, or a stray
  clone of a single repository exposes all twenty people's private notes.
- A personal store can sit under that person's own account, so not even the administrator reads it. With one
  repository, or one organization owning every repository, the administrator always can.
- Every agent keeps an ordinary checkout. The promise that any harness operates a store from its files holds for
  every person, not only for the administrator and the server.
- `retire-the-access-axes` D1 stays closed: no per-note classification is introduced.

### D2. The person's own store is the center; shared stores are mounted into it

Each person keeps their own store and agent. Shared stores are mounted into it. **Alternatives:** read-only peer
stores consulted by citation (gbrain's mounts), rejected because writing to shared knowledge is the common case, and
a peer one cannot write to pushes every shared fact back into a personal store. One repository per audience under a
single synthetic root, rejected because nobody's personal configuration, mission and skills would have a home.
**What this costs:** a session can touch more than one repository; a share is a move across two. D9 argues why the
second cost is useful.

### D3. Mounts sit under `shared/<name>/`; reading merges them, the paths never do

**Case for mounting into the person's own layers** (a shared project at `projects/<name>/`): the layer describes
the reader's relationship to a note, and a shared project is still one of the reader's projects. With a prefix, the
question "what am I working on" has to look in more than one place.

**Why a prefix:**
- A shared note's layer is set by the shared store, not by each reader, so merging does not give each person their
  own layers anyway. That would need a different mount point per person, which breaks D6's promise that a link
  resolves the same in every checkout.
- One misplaced write is a disclosure. If `projects/` mixes personal folders with shared mounts, a note created one
  directory off is shared, and nothing in the path warned anyone. Google Drive removed exceptions inside shared
  folders in 2025 for this reason.
- Mount points inside layers mean a symlink or nested clone per shared item, an ignore entry per item, and tools
  that treat symlinks differently (`rg` does not follow them by default).
- The path says who can read a note before it is opened.

A reader's own relationship to a shared note is expressed in the reader's store: their mission and notes link
to it. `catalog show` merges by section across mounts. A unified browsing surface is a later change.

### D4. A mount is a clone that `ctxr` manages, ignored by the mounting store

`ctxr shared-stores sync` clones and fast-forwards; an entry in the repository's local exclude file keeps the clones
untracked without touching a tracked file.
**Case for git submodules:** the mounted commit is recorded in the mounting store's history, so a checkout is
reproducible, and git already knows how to clone them. **Why not:** a pinned commit is exactly wrong for a store
written to continuously. Every shared change would need a commit in every mounting store to move the pin, and
agents would read stale shared notes between bumps. Submodules also carry their own worktree and `--recursive`
pitfalls. A mount here is live content, not a dependency version.

Sync uses the same conditions as `land-sweep-syncs-canonical-clone`'s canonical sync: it fast-forwards a clone only
when it is on the default branch, clean, and fast-forwardable. A mount with local work is somebody's session, so it
is reported and left alone.

### D5. A mounted store governs itself, and commands run inside it resolve to it

The mounted store's own `contexture.yaml` governs its notes in every checkout: exclusions, taxonomy, write paths,
hooks, approval. Root resolution sends a command run inside a mount to the mount, even under a
`CONTEXTURE_STORE_ROOT` naming the mounting store, so `ctxr session start` inside `shared/<name>/` opens a
session in that store.

**Case for the mounting store's configuration governing everything in its view:** one configuration to read, and
one set of exclusions over the whole view. **Why not:** two people mounting one shared store would apply different
rules to the same notes, and a note admitted in one person's view would be excluded in another's. The shared store's
members decide its rules, in one place.

The mount step in root resolution is limited to locations the named store declares, so a stray clone under the
mount path does not capture commands.

### D6. Links resolve within the store that owns the note

A filename link resolves among the owning store's notes. A new path link (`[[dir/note]]`) resolves against the
owning store's root. A personal note reaches a shared note by a path link under `shared/<name>/`.

**Case for resolving filename links across the whole view:** it is how Obsidian behaves, and nobody has to type
a path. **Why not:**
- Shared stores multiply notes that share a name: a person note for a colleague in the personal store and in the
  organization's store. Resolving across the view turns every such pair into an ambiguous link, which fails
  `doctor`.
- A link would resolve differently in different checkouts. A shared note linking `[[ctx-person]]` would resolve to
  its author's private note in the author's checkout and dangle in everyone else's. The author would see a working
  link that leaks a private note's title to every other reader.
- The path form makes a link that crosses into a shared store visible where it is written.

Owning-store resolution gives the direction rule for free: a mounted store's notes cannot resolve anything outside
the mount, so a shared note never links to a private one. Path links are Obsidian-compatible (Obsidian resolves
`[[folder/note]]`), and in a store without mounts they only turn links that dangle today into resolved ones.

### D7. The store's own enumeration stays its own; the read view adds mounts

The mounting store's note enumeration excludes `shared/`. That keeps its tracked catalog, coverage
check, commit gate and graph delta exactly about its own notes. A separate read-view enumeration adds each mount's
admitted notes under its prefix for the graph build and the retrieval pass. The graph cache is ignored by git, so
including mounts there writes nothing a reviewer sees.

**Case for including mounts in the tracked catalog:** one catalog to read. **Why not:** every shared edit would
churn every mounting store's catalog, and a shared store's glosses would be copied into repositories with other
histories. `catalog show` reads each mount's own catalog instead.

Mounts are read from the main working tree, because session worktrees of the mounting store do not contain the
ignored `shared/` directory. Without this, the read view in a session would silently lose every shared note.

### D8. Mounts of mounts are not followed, yet

A group store at twenty people will want the organization's notes, a team store linking organization notes. That
needs a mounted store's own mounts to resolve the same way in every checkout. Mount names are chosen per store, so
`ctx-b`'s mount `org` might be mounted as `company` by a reader. Settling that naming (global mount names, or
resolution through the owning store's declared names) is its own decision. This change keeps one level and states
the owning-store rule the follow-up extends.

### D9. Sharing is a move through the shared store's review

Moving a note into a shared store is a pull request on that store, reviewed by its deciders. Before that pull
request, every link the note carries to a note that stays private is settled. Either that note is shared in the
same pull request, or the link is rewritten to plain text, or the move stops with a report. Otherwise the shared
copy carries a link whose text names a private note to every reader. `lint` in the mounting store reports any such
link that gets through. Removing the original,
and turning links to it into path links, is a second pull request on the personal store, after the first lands.
**Case against:** two pull requests where one repository needs one. **Why accept it:** this is the one write that
discloses, and the repository boundary makes it a separate, reviewable change. In the one-repository design it would
need detecting and gating separately. Unsharing protects only later edits: a moved note is in the shared store's
history and in every reader's clone, and the skills say so.

### D10. The check, not the ignore file, is what keeps mounted content out of history

The ignore entry stops accidental adds. `git add -f` bypasses it. `doctor`'s shared-stores check fails on anything
tracked or staged under the path, and the pre-commit hook runs `doctor --staged`. This is the mechanism the
requirement names. Like every hook it can be bypassed with `--no-verify`; the guarantee stays "nothing reaches the
default branch un-gated".

## Risks / Trade-offs

- **[Privacy depends on credentials outside the CLI]** A container holding a token for someone else's personal
  store breaks the model, and nothing in `ctxr` can see it. → Provisioning in `contexture-images` issues each
  container credentials for that person's stores only. `ctxr shared-stores status` reports what is mounted, so an
  audit is "what can this container clone".
- **[An agent moves private content into a shared store]** A rollup or summary written into a mount can carry
  private facts. → It is a pull request on the shared store, reviewed by its deciders. Whether the requester's own
  approval is also required is open below.
- **[Stale mounts]** Reads see the shared store as of the last sync. → The lifecycle skill runs `ctxr
  shared-stores sync` at session start. A later change can have `serve` keep mounts current the way it keeps the
  canonical clone current.
- **[Contention on a shared store at twenty writers]** → Existing landing: rebase, approval carried across a clean
  rebase, conflict resolver. The catalog is a likely conflict point and is watched in the first real deployment.
- **[Path links break on rename]** A personal note's path link into a mount dangles if the shared note moves. →
  Lint reports dangling links. The move skill already rewrites links within a store; across stores it is a manual
  step named in the skill.
- **[Entry document size]** The new section appears only when mounts are declared, so the shipped ceiling test,
  which measures a default store, is unaffected. A store declaring mounts pays a few hundred bytes against
  Antigravity's 24 KB limit.
- **[Compute at twenty people]** One agent per person means one container per person, about 0.6–2 GB each on the
  current host. → A larger host, or personal agents on people's own machines. Not this change's concern, but it is
  what makes the design deployable.

## Migration Plan

None required. The list is opt-in, and a store without it is byte-identical. Rollout is a release: a store opts in
by adding `shared_stores` and running `ctxr shared-stores sync`. For example, a personal store mounts its company's
store. Rollback is removing the list and the clone directory; nothing in any store's history refers to a mount
except path links, which then dangle and are reported by lint.

## Open Questions

- **Should a change into a shared store need its requester's approval as well as a decider's?** The requester is the
  person whose private notes might be leaking. Today, any decider of the shared store approves. Answering yes adds
  a rule to change approval and needs the requester recorded on the pull request. It does not change anything this
  change builds, so it is deferred to the multi-store `serve` proposal, which owns approval across stores.
- **Command naming.** `ctxr shared-stores sync|status` is used here for clarity where it is typed. A shorter group
  name can be chosen at implementation without changing behavior.
