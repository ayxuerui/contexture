## ADDED Requirements

### Requirement: contexture ships a research procedure written against any harness's web access
contexture SHALL ship an owned research skill that states a procedure in this order:
1. Frame the question from what the store already knows, including checking connected sources for uncaptured primary material, and ask at most one scoping question.
2. Question the topic from up to three perspectives plus the basic facts, and report a perspective it could not source.
3. Turn questions into search queries.
4. Tier sources (primary, secondary, weak, unreliable), never letting a lower tier carry a decision alone.
5. Map contradictions, source-bias transfer, over-association, and blind spots.
6. Synthesize against the store.
7. Review the result before anyone acts on it.
8. Land it through the ingest-orchestration and placement skills.

The skill SHALL be written against whatever web access the harness provides. It SHALL name no browser, tunnel, port, or tool of a particular harness, SHALL direct the agent to a store's own documented browser routing when one exists, and SHALL direct it to stop and say so when the harness can reach no web source rather than answer from memory.

#### Scenario: The research skill names no harness's browser
- **WHEN** the research skill is rendered for any store
- **THEN** it states that web access differs by harness, follows a store's own browser routing when documented, stops when there is no web access, and contains no harness-specific browser, tunnel, port, or tool name

#### Scenario: The research skill carries its procedure in order
- **WHEN** the research skill is rendered
- **THEN** it carries framing, perspectives, query construction, source tiers, the contradiction map, synthesis, review, and landing through ingest orchestration, in that order

### Requirement: The capture skill names identity for material no system identifies
The capture skill SHALL state that material carrying no source-system identifier takes a content hash as its source id: a file's SHA-1, or the SHA-1 of pasted text. It SHALL state that an email is identified by its `Message-ID`, that a web page is identified by its URL as compared with the store's configured tracking parameters removed, and that the same prefixed form is passed to `ctxr ingest`. It SHALL state that a slide deck is read as rendered pages, not extracted text.

#### Scenario: Capture names the hash convention and the prefixed form
- **WHEN** the capture skill is rendered
- **THEN** it names `pdf/<sha1 of the file>` and `manual/<sha1>`, the email `Message-ID`, the URL compared without tracking parameters, the prefixed `--source-id`, and reading a deck as images
