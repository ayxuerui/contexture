# Spec Delta

## ADDED Requirements

### Requirement: `ctxr second-opinion serve` starts a server without a store
`ctxr second-opinion serve` SHALL take `--config <file>`, `--port`, `--host` and `--state-dir`, and SHALL bind to loopback when `--host` is not given. It SHALL need no store, and a store nearby SHALL NOT change what it serves. It SHALL report its address once it listens, as `ctxr serve` does, and SHALL exit with the usage code, without listening, when the file is missing or does not load.

#### Scenario: It starts from a file alone
- **WHEN** the command runs in an empty directory with `--config` naming a valid file and `--json`
- **THEN** it prints one envelope carrying its address once it listens, and keeps running

#### Scenario: A missing file is a usage error
- **WHEN** the command runs with `--config` naming a file that does not exist
- **THEN** it exits with the usage code naming the file, and nothing listens

#### Scenario: A store nearby is ignored
- **WHEN** the command runs inside a store whose `contexture.yaml` routes a lineup entry through OpenRouter, with a file that names no route
- **THEN** a run it starts resolves every entry to its CLI, as the file says

### Requirement: The second-opinion server's file is strict and holds no secret
The file SHALL hold `base_url`, an origin with no path; `identity`, with the keys a store's `change_approval.identity` takes; `members`, a non-empty list of emails or `@domain` suffixes; and optionally `second_opinion`, a store's lineup block with its shipped defaults. An unknown key SHALL fail the load, naming the key. The schema defines no key for a secret, so writing one fails the same way.

#### Scenario: A minimal file loads
- **WHEN** a file holds `base_url`, `identity` and `members` and no `second_opinion`
- **THEN** it loads, and a run resolves every lineup entry to its shipped default

#### Scenario: A key in the file is refused
- **WHEN** a file adds `openrouter_api_key` at its top level
- **THEN** the load fails naming `openrouter_api_key`

#### Scenario: An address with a path is refused
- **WHEN** `base_url` is `https://ctx-a.example/opinion`
- **THEN** the load fails naming `base_url`, since sign-in is served at the root of the origin
