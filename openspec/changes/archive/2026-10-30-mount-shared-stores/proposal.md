## Why

A store has one audience today: whoever can clone its repository. A family of two or a company of twenty needs three
kinds of notes at once: notes only one person may see, notes everyone may see, and notes a group may see. The only
boundary that withholds a note from someone's agent is the repository: a git clone holds every blob in
`.git/objects`, so a per-note label, a harness deny rule, or encryption inside the repository each leaves the bytes
with the agent or leaks their names. `retire-the-access-axes` removed the per-note labels for that reason, and
nothing replaced them.

The design that keeps every boundary a repository boundary is: each person keeps their own store and their own
agent, and the stores they share with others are mounted into their checkout. A person's agent then holds a clone of
exactly what that person may read. This is the model 1Password (a private vault plus shared vaults), Google Drive
(My Drive plus shared drives), and Tana (a private workspace plus shared ones) converged on, and git's own
documentation recommends a separate repository for private data. Stores already run this way for one person (`pkm`)
and for one company (`readyrun-brain`); what is missing is mounting one into the other.

## What Changes

- **A store may declare the shared stores it mounts.** A new optional `shared_stores` list in `contexture.yaml`
  names each mounted store and its clone URL. With no list, nothing changes. The location is fixed at `shared/<name>/`.
- **`ctxr shared-stores sync` clones each declared store under `shared/<name>/` and fast-forwards it.** The clones
  are ignored through an entry in the repository's local exclude file, never a tracked file. A clone that has uncommitted changes, is on
  the wrong branch, or has diverged is reported and left alone. `ctxr shared-stores status` reports each mount's state
  without changing anything.
- **A mounted store stays a store.** Its own `contexture.yaml`, exclusions, skills, sessions, review and approval
  govern its notes. A write to it is a session in that clone and a pull request on its repository, through the write
  lifecycle that already exists.
- **Root resolution sends a command run inside a mount to that mount,** even when `CONTEXTURE_STORE_ROOT` names
  the mounting store.
- **The mounting store's read view includes its mounts.** The graph build, the retrieval pass, and `catalog show`
  cover the store's own notes plus each mounted store's notes, each admitted by the exclusions of the store that
  owns it. The mounting store's tracked catalog, coverage check, and commits stay limited to its own notes.
- **Links resolve within the store that owns the note.** A filename link (`[[note]]`) resolves among the owning
  store's notes only, and a new path link (`[[dir/note]]`) resolves against the owning store's root. A note in the
  mounting store reaches a mounted note only by a path link under `shared/<name>/`, so a link that crosses into a
  shared store is visible where it is written. A mounted store's notes cannot resolve a link into the mounting
  store, so a shared note never points at a private one.
- **`doctor` fails if the mounting store tracks anything under `shared/`.** That is the mechanism that
  keeps a mounted store's content out of the mounting store's history.
- **The entry document gains a shared-stores section when mounts are declared,** listing each mount and naming
  the rule that a write to it is a session in that mount.
- **The placement and lifecycle skills ask who should see a note before which layer it belongs in,** default to
  the person's own store, and treat sharing as moving a note into a mount through that mount's review, after settling every link the moved note
  carries to notes that stay private.
- **`lint` in the mounting store reports a shared note whose link names one of the person's private notes,** the
  disclosure a move can leave behind.

## Non-goals

- **Access control inside one store.** A store still has one audience. Privacy between people is a store
  boundary, never a field on a note; this change does not reopen `retire-the-access-axes` D1.
- **Mounts of mounts.** A mounted store's own `shared_stores` list is not followed. A group store that needs an
  organization's notes, which a twenty-person company will, is a follow-up; the owning-store resolution rule this
  change adopts is the one it would extend.
- **Serving mounted notes from the mounting store's `serve`.** Each store's `serve` serves its own notes and pages
  at one canonical address. A unified browsing view across stores is a later change.
- **Pages built from more than one store.** Where such a page lives and who may view it is the next proposal
  (pages that respect their sources).
- **One `serve` landing changes for many repositories.** Each shared store keeps its own `serve` for now; a
  `serve` that handles many stores is its own proposal.
- **A requirement that the requester approve their own change into a shared store.** Today any decider of the
  shared store approves. Whether moving one's own private content into a shared store needs that person's approval
  is recorded as an open question in design.md.
- **Provisioning containers with mount credentials.** One agents container per person, holding deploy keys or
  tokens for that person's stores only, is deployment work in `contexture-images`, sequenced after this change.

## Capabilities

### New Capabilities
- `shared-stores`: a store declaring, cloning, and refreshing the stores it mounts; a mounted store governing its
  own notes and writes; the mounting store never tracking mounted content.

### Modified Capabilities
- `context-retrieval`: the read view covers mounted stores, each note admitted by its owning store; links resolve
  within the owning store; path links resolve against the owning store's root.
- `context-catalog`: `catalog show` reads the same section from each mounted store, labelled by store, without
  rebuilding it into the mounting store.
- `store-integrity`: `doctor` gains the untracked-mount check, and its ambiguous-link check is decided per
  owning store.
- `harness-portability`: root resolution redirects into a declared mount; the entry document's fixed section
  order gains the shared-stores section.

## Impact

- `src/config/schema.ts`: an optional `shared_stores` list with no shipped default.
- New `src/commands/shared-stores-sync.ts` and `shared-stores-status.ts`, reusing the canonical-sync rules
  from `land.ts`.
- `src/core/notes/list.ts`: the store's own enumeration excludes `shared/`; a new view enumeration
  adds each present mount's notes under its prefix.
- `src/core/graph/model.ts`: resolution scoped to the owning store, plus path links.
- `src/core/root.ts`, `src/core/checks/`, `src/core/agents-doc.ts`, `src/commands/catalog-show.ts`.
- Skills: `ctxr-placement`, `ctxr-session-lifecycle`, `ctxr-submit`, `ctxr-connection-finding`,
  `ctxr-rollup` (gathering across mounts).
- `openspec/config.yaml`: the tenancy paragraph changes from "single-owner store" to "one audience per store".
- Follow-ups outside this repository: `contexture-images` provisioning (one container per person, mount
  credentials), then multi-store `serve` and pages that respect their sources.
