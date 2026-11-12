## MODIFIED Requirements

### Requirement: The Circleback skill routes meetings by tag without handling a credential
contexture SHALL ship `ctxr-capture-circleback` as an opt-in owned skill, enabled by a `circleback` block naming this store's tag, optionally the tags that route a meeting to other stores, and optionally the tag that declines a meeting (absent means `no-capture`). It SHALL be the capture skill's retrieval step for Circleback, and SHALL hand back to the capture skill at its second step rather than carry a capture procedure of its own. The skill SHALL carry a runner, invoked with `node` and depending on nothing outside the Node standard library, and a settings file rendered from that block. The runner SHALL drive Circleback's own command-line tool, `git` and `gh`, and SHALL NOT read, write or store any credential.

The runner SHALL read the meetings of a fixed lookback window with their tags, and SHALL treat a meeting as owed by this store when it carries this store's tag, carries neither the decline tag nor another store's tag, is absent from the store's default branch, from every open pull request, and from every other local worktree of the store (uncommitted files included, its own review worktree excepted), and is still readable in full. For owed meetings it SHALL prepare a review-branch worktree at a fixed path, clearing what an earlier run left there, and SHALL write each one's verbatim record into the configured inbox there: the source type and id, metadata, attendees, the source's action items and summary marked as its own derivation, and the transcript verbatim under the store's required capture section for the source type, with trailing whitespace removed and the recording URL never written. It SHALL print a report naming what it retrieved, and separately what is held only in a local worktree, locked, untagged, tagged for more than one store, and recently declined. A failure SHALL be reported as such and never as an empty list.

The skill SHALL direct the agent to continue each retrieved record with the capture skill from its second step: checking the record, including its speakers; confirming the identity already stamped; and the dedupe check. Interactively the capture skill's hand-off follows. In a scheduled run the skill SHALL stop at a review pull request instead, and SHALL state that the agent never merges it.

#### Scenario: Only owed meetings are rendered
- **WHEN** the runner sees meetings that are tagged for this store and absent, tagged for this store and present, tagged for this store and locked, untagged, tagged for this store and another, declined, and tagged only for another store
- **THEN** only the first is rendered into the inbox, and each of the others is counted as present or listed under its own report section

#### Scenario: A capture carries the record and no credential
- **WHEN** an owed meeting is rendered
- **THEN** the capture carries `source_type: circleback` and its prefixed source id, the transcript under the store's required section, no trailing whitespace, and not the recording URL

#### Scenario: A repeated run does not collide with the last
- **WHEN** the runner runs twice with the same meetings owed
- **THEN** the second run reuses the fixed worktree path and renders the same captures without failing

#### Scenario: A capture in flight is not taken again
- **WHEN** a meeting tagged for this store is captured in another local worktree of the store but not committed, pushed or proposed
- **THEN** the runner does not retrieve it, and lists it as held only in that worktree, naming the worktree

#### Scenario: The runner's own earlier output does not count
- **WHEN** the runner's review worktree still holds a capture from an earlier run whose pull request was closed unmerged
- **THEN** that capture does not count as present, and the meeting is retrieved again
