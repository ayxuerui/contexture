## MODIFIED Requirements

### Requirement: Visibility is enforced as a pre-filter
Any operation that enumerates notes on behalf of a requesting context SHALL exclude notes whose resolved visibility that context cannot see before the operation ranks, traverses, synthesizes, or otherwise processes results. The exclusion SHALL NOT be applied only to the final output after processing has already used the excluded note's content. This SHALL hold whether the requesting context is supplied as an argument (an `--as <context>` flag or equivalent) or derived by the operation from its own subject — an operation SHALL NOT be exempt merely because no caller named a context.

#### Scenario: An excluded note never influences a result
- **WHEN** a graph traversal requested `--as ctx-a` would otherwise pass through a note whose resolved visibility `ctx-a` cannot see
- **THEN** that note is excluded from the traversal itself — it contributes no edges and appears in no result — not merely omitted from the final list

#### Scenario: A one-hop excluded neighbor is omitted, not just deprioritized
- **WHEN** `contexture graph neighbors <note> --as ctx-a` is run and one of `<note>`'s direct neighbors has a resolved visibility that `ctx-a` cannot see
- **THEN** that neighbor is absent from the result entirely

#### Scenario: An operation that derives its own context is not exempt
- **WHEN** an operation enumerates notes on behalf of a context it derived from its own subject rather than from a caller-supplied argument
- **THEN** it applies the same exclusion before processing, exactly as if that context had been passed to it
