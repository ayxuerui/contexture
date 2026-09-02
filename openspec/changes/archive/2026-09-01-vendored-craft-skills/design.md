## Context

See `proposal.md` — Why. Two facts about the current code shape drive most of what follows.

`harness.skills_path` is a single string (`src/config/schema.ts`, `HarnessSchema`), so nothing today
can express "this store is driven from two harnesses." And `syncShippedSkills` (`src/core/skills.ts`)
recognizes what it owns by looking for `MANAGED_SKILL_HEADER` inside each `SKILL.md`, deleting only
directories that carry it — which is why operator-authored skills survive an update, and why a
vendored skill that cannot carry that header needs a different identifying mark rather than a
loosened deletion rule.

The upstream format is fixed by the Agent Skills spec: a skill is a directory whose name must equal
its `SKILL.md` frontmatter `name`, optionally alongside `scripts/`, `references/`, `assets/`. The
chosen payload is two files, but the mechanism is written for the general case.

## Goals / Non-Goals

**Goals:**
- Deliver a working craft skill to a fresh store with no operator action and no network.
- Make "which directories do skills go in" a single derived answer both owned and vendored skills use,
  so a second harness is a configuration line rather than a second code path.
- Never destroy an operator's local edit to redistributed content, and never silently modify content
  contexture did not author.

**Non-Goals:** see `proposal.md` — Non-goals. At the design level additionally: no attempt to model
per-harness *content* variation. A vendored skill is byte-identical in every target directory; if a
harness ever needs different content, that is a different change and probably a different mechanism.

## Decisions

**Provenance sidecar rather than the managed header.** `syncShippedSkills` identifies its own files by
a header injected at the top of the rendered file, which works because contexture authored every byte.
It cannot work here: inserting a header into an Apache-2.0 licensed file both modifies the licensed
work and displaces the frontmatter the format requires at the top of `SKILL.md`. So a vendored skill
is marked by a sibling file — a small JSON record naming the upstream source, pinned revision, license,
delivered-file hash, and the contexture version that wrote it. Alternative considered: a marker inside
the sidecar-free directory name (e.g. a `vendor-` prefix). Rejected because the directory name is
load-bearing in the format — it must equal the frontmatter `name` — so it cannot also encode ownership.

**The hash is what makes the operator-edit rule mechanical.** With the delivered file's hash recorded,
three cases separate cleanly without asking the operator anything: hash matches and payload differs →
refresh; hash matches and payload identical → write nothing; hash does not match → an operator edited
it, so leave every file alone and report. This is the same instinct as `syncShippedSkills`' byte-stable
comparison, extended with one bit of memory so that "changed" can be attributed to the operator rather
than to contexture. Alternative considered: always overwrite, treating vendored content as fully owned.
Rejected — it silently discards local work, and contexture's existing posture everywhere else is that
operator content is untouchable.

**One canonical directory, bridged — not N copies.** Skills are written once to the configured skills
path, which defaults for new stores to the ecosystem's cross-harness canonical location; a majority of
agent runtimes read it natively, so most stores need no bridge at all. A harness that reads its own
branded directory gets that directory bridged to the canonical one. Alternative considered: writing a
full copy into every declared harness's directory. Rejected as the default because it multiplies the
same bytes across a store for harnesses that mostly do not need it, and because duplicated copies are
a drift surface that has to be re-verified per directory forever.

**The bridge prefers a symlink and falls back to a copy.** A directory symlink gives one physical copy
and cannot drift by construction, and it is what the ecosystem's own installer does by default. But
symlinks are not universally representable — a checkout on a platform or filesystem without symlink
support turns a committed link into a regular file holding a path string, which the harness then reads
as a broken skill. So bridging attempts a symlink, falls back to copying when creation fails, and
reports which mechanism it used. This mirrors the reference installer's own
`createSymlink() -> boolean` contract, where `false` means "fall back to copy," and it is why the
spec states the outcome as "the directory resolves to the canonical one" rather than naming symlinks
as the mechanism.

Idempotence needs the same care that installer takes: before creating anything, resolve both paths
with `realpath` *and* re-resolve through symlinked parents, because a store whose canonical directory
is itself reached through a link would otherwise look different from a link already pointing at it and
get needlessly rewritten — or worse, deleted and recreated on top of itself.

**The entry document still indexes the configured skills path alone.** It is a document about this
store's canonical layout; listing the same skill once per harness that reads it would make the index
worse, not better.

**The interface version bumps rather than the field being optional.** Adding `skillsDir` as an optional
field on the existing version 1 interface would let a stale third-party adapter resolve to *no*
directory and silently contribute nothing. Bumping harness-generation to version 2 makes the field
required at the type level and routes stale adapters into the refusal path the adapters capability
already specifies, with a `doctor` finding that names them. The same bump carries the entry-file
relaxation, so there is one version step rather than two.

**Entry file becomes optional in the same step.** The new skills-only adapter has no entry file to
generate — the harness reads the canonical entry document directly. The alternative, inventing a
wrapper file for it, would add a file to stores for no reader. Making `entryFileName`/`render`
optional is a smaller change than it looks: the entry-file generation path already iterates configured
adapters, so it gains a skip rather than a branch.

**Changing the default skills path is safe because the value is written into every store.** Each
store records its own skills path at init, so moving the *default* changes new stores only; an
existing store keeps the path already in its configuration and needs no migration. What it does touch
is contexture's own fixtures — the tests asserting an exact skills directory and the exact `git add`
argument vector at init — which move with the default.

**Prior art points both ways, and that is worth recording.** The ecosystem's skills installer
symlinks by default. OpenSpec, whose setup stage is the closest analogue to what `init` does here,
copies instead: a store set up by it carries three real, independent skill directories with identical
contents and no links anywhere. Choosing symlink-with-copy-fallback takes the first as the preferred
mechanism and the second as the guaranteed-correct floor, rather than picking one and inheriting its
failure mode.

**Re-vendoring is a maintainer script, not a command.** `scripts/vendor-skills.mjs` fetches pinned
upstreams and rewrites the payload plus recorded hashes; a test asserts the committed payload matches
its recorded hash, so a hand-edit of vendored content fails CI rather than shipping. This is what lets
the CLI stay free of network code while the payload remains updatable on a normal release cadence.

## Risks / Trade-offs

- **A vendored skill goes stale between releases.** → Accepted deliberately as the price of offline,
  deterministic init. The provenance record pins and displays the upstream revision, so a store can
  always see what it has; refreshing is a contexture release, not a store-side action.
- **Contexture becomes a redistributor, with license obligations.** → The payload ships its upstream
  license verbatim inside the skill directory and the repository gains a third-party notices file
  naming source, revision, and license. Only permissively licensed upstreams are eligible, which is
  already why the chosen payload is the one it is.
- **Upstream content can trip contexture's own authoring guards.** The shipped-skill tests reject
  taxonomy-profile names and visibility-value words, and upstream prose is written without any
  knowledge of those rules. → Those guards iterate `renderSkills(config)`, which covers owned skills
  only; vendored content is never rendered through it. The tests will state this exemption explicitly
  so a future reader does not "fix" it by widening the loop.
- **A committed bridge symlink can be materialized as a regular file by a clone that cannot represent
  it**, leaving the harness reading a one-line text file instead of a skill directory. The copy
  fallback protects the machine that runs `init`; it cannot protect a later clone elsewhere. → The
  bridge is therefore treated as repairable state rather than a one-time write: `doctor` reports a
  directory that neither resolves to the canonical location nor holds the current skills, and
  `update` re-establishes it. A store that would rather never depend on links can override the
  harness's directory to equal the canonical path, which produces no bridge at all.
- **A store whose canonical directory is reached through a symlink could confuse bridge detection**
  into rewriting or, in the worst case, removing the canonical directory it is meant to point at. →
  Resolve both sides through `realpath` and through symlinked parents before acting, and treat
  "already resolves to the same real path" as success rather than as something to fix — the failure
  the reference installer guards against explicitly.
- **A store could declare a harness adapter whose directory collides with an unrelated tool's.** →
  The directory comes from the adapter, and adapters are contexture's own registered code, so the
  blast radius is limited to adapters contexture ships; a store can still override the configured
  skills path if it needs to relocate.

## Migration Plan

Additive. The new configuration block is schema-optional with a default, so a `contexture.yaml`
written before it parses unchanged and resolves to the shipped set — no schema-version bump and no
migration, the same approach the publish-path field used. The interface-version bump affects only
adapters contexture itself ships, both of which move to version 2 in this change; a third-party
adapter still on version 1 is refused loudly by the existing rule rather than silently misbehaving.

The canonical-path default applies to newly initialized stores only. An existing store keeps the
skills path recorded in its own configuration, so `ctxr update` adds one vendored skill directory
there and creates no bridge it was not already configured for; relocating an existing store to the
canonical path is an operator's deliberate configuration edit, not something this change performs.
`skills.vendored: []` returns a store to its current contents.
