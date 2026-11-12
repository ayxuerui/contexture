## Decisions

### D1. A source-specific skill, behind an opt-in block

**Case against:** contexture keeps capture source-neutral on purpose. The capture skill is checked for service
names, and the spec says contexture ships no client for any capture source. A Circleback skill names one vendor.
**Why ship it anyway:**
- It reaches only a store that declares `circleback`, so no other store's `AGENTS.md` index or skills change.
- The generic capture skill is untouched and still source-neutral.
- Like `ctxr-second-opinion` driving model CLIs, the runner drives the source's own CLI. That CLI holds the
  credential; contexture reads and stores none.

The capture requirement's sentence is amended to say so explicitly, rather than leaving the skill to argue with it.

**Naming:** `ctxr-circleback` is named for the source. There is no `ctxr circleback` command, and a
`ctxr-circleback-capture` name would read as one.

### D2. The runner does the mechanical work; the agent does the judgment

Three runs of an agent-built version failed:
- it trusted search results that carry no tags;
- it stopped on trailing whitespace in transcripts;
- Hermes blocked its heredoc and Python helpers.

So the runner owns everything mechanical:
- the owed list;
- the worktree;
- the capture file.

The agent adds only what needs reading: a speaker caveat where labels are generic or the summary swaps people.
Then it runs the dedupe check, commits and opens the pull request. The skill states the hand-off, so the same
procedure works interactively and from a scheduled job.

### D3. Settings are rendered, not read from `contexture.yaml`

A critique proposed having the runner read `contexture.yaml` itself instead of a rendered `settings.json`. Rejected:
- the runner is held to the Node standard library, like `ctxr-second-opinion`'s, which has no YAML parser;
- ctxr has no command that prints its config.

Rendering needs one change: `supportingFiles` receives the config. Since sync compares bytes, a config change
rewrites `settings.json` like any other drifted copy.

### D4. Opt-in skills are a second list, not a flag on the first

`SKILLS` stays the set every store gets, so everything that counts or iterates it is unchanged. `OPTIONAL_SKILLS`
holds seeds with `enabled(config)`, and `activeSkillSeeds(config)` joins them. Render, sync and the shipped-file map
use the active set, so removing the block drops the skill from what the store is shipped. The existing removal of
managed skills that are no longer shipped then deletes its directory.

### D5. Optional keys stay optional

`other_tags` and `decline_tag` are `.optional()`, not defaulted, so a rewritten config never gains a key the store
did not write. The decline tag's fallback lives in `DEFAULT_CIRCLEBACK_DECLINE_TAG`, not in `SHIPPED_DEFAULTS`.

### D6. A fixed worktree path, cleared by the runner

A scheduled agent may not be allowed to delete anything, so the runner clears and prunes the previous run's
worktree itself at `$TMPDIR/ctxr-circleback-<store>`. It then continues the open pull request's branch, or starts
fresh from the default branch. A second run reuses the path instead of colliding.

## Critique

Run on the plan before implementing (`ctxr-second-opinion`, critique mode, strong tier). All three reviewers
approved with changes. This change's author shares a model family with the Claude reviewer.

- **Taken:**
  - The Hermes launcher must `cd` into the store and call the runner by absolute path (Claude and Codex). That is
    the follow-up in contexture-images.
  - A fixed, self-clearing worktree path, D6 (Claude).
  - A rollout that adds the block to both stores and retires the old script and jobs (Claude).
- **Declined:**
  - Reading `contexture.yaml` from the runner instead of a rendered settings file (Gemini); see D3.

## Risks

- **`cb`'s JSON shape can change.** The runner fails loudly (`COLLECTION FAILED`) rather than reporting an empty
  list, and the integration test pins the shape it relies on.
- **Recognising a locked meeting.** It depends on the notice Circleback writes in place of the notes. If that text
  changes, a locked meeting reads as owed and renders a near-empty capture. The speaker-caveat step reads the file,
  so it would be noticed.
