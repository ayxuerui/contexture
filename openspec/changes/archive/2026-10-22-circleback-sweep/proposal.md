## Why

One Circleback account feeds two stores (pkm and readyrun-brain), and contexture deduplicates within one store only.
Routing now runs on Circleback tags, with a weekly job in each store's Hermes that captures what the store's tag says
it owes. That job's logic lives in a hand-copied Python script in each container, outside any repository.

The first runs showed how much of the job has to be mechanical:
- Circleback's search returns no tags.
- JSON piped through a shell gets its escapes rewritten.
- Hermes blocks heredocs, Python runs and deletes in unattended jobs.

An agent left to collect the list or build the capture files by hand got it wrong or was blocked three times. The
operator wants the script owned by contexture and copied into Hermes on deployment.

## What Changes

- **Opt-in owned skills.** An owned skill can be enabled by an optional top-level block in `contexture.yaml`. A store
  without the block never gets the skill, and removing the block makes `ctxr update` remove it. Supporting files may
  be rendered from the store's config.
- **New `circleback` block**: `tag`, optional `other_tags`, optional `decline_tag` (absent means `no-capture`). No
  shipped default.
- **New opt-in skill `ctxr-circleback`.** Its runner `sweep.mjs` (Node standard library only) reads the last 35 days
  of meetings with their tags through Circleback's CLI and compares them with the default branch and open pull
  requests. It renders each owed meeting's mechanical capture into the inbox on a review-branch worktree at a fixed
  path, and prints a report. A rendered `settings.json` carries the routing. The skill leaves the speaker caveat, the
  dedupe check, the commit and the pull request to the agent.
- **The capture requirement's "no client for any capture source" sentence** gains an explicit allowance: an opt-in
  skill may drive a source's own CLI when it handles no credential. The generic capture skill stays source-neutral.

## Non-goals

- **A Circleback client or credential handling in contexture.** The runner calls `cb`, which holds its own login.
- **Hermes wiring.** Copying the skill into `/opt/data/scripts` with a launcher, and pointing each store's job at
  it, is a contexture-images change that follows this release.
- **Ingest.** Captures land in the inbox on a pull request; ingesting them stays interactive.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-portability`: opt-in owned skills, the Circleback skill, and the capture requirement's allowance.

## Impact

- `src/config/schema.ts` (`circleback` block), `src/config/defaults.ts` (`DEFAULT_CIRCLEBACK_DECLINE_TAG`).
- `src/core/skills.ts`: `SkillSeed.enabled`, config-aware `supportingFiles`, `OPTIONAL_SKILLS`, `activeSkillSeeds`;
  render, sync and the shipped-file map use the active set.
- `templates/skills/ctxr-circleback.md`, `templates/skills/ctxr-circleback/sweep.mjs`.
- Tests: `test/unit/skills.test.ts`, `test/unit/config-schema.test.ts`, `test/integration/circleback-sweep.test.ts`.
- README.
- **Downstream:** pkm and readyrun-brain add a `circleback` block. contexture-images copies the skill into Hermes at
  start, and the stores' jobs switch to it; the hand-copied Python script and its jobs retire.
