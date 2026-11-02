## MODIFIED Requirements

### Requirement: The recording identity may be a GitHub App with credentials from the environment only
The commands that read or record decisions (`ctxr serve`, `ctxr review list`, `ctxr land`) SHALL authenticate to
the forge as a GitHub App when the environment sets `CONTEXTURE_GITHUB_APP_ID` and exactly one of
`CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` (a path to a PEM file) or `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` (PEM
text). Otherwise they SHALL authenticate as `gh` does by itself. No key, key path or App ID SHALL be read from
`contexture.yaml`. A command SHALL exit with the setup/usage code, naming the variables involved, when only part
of the App credential is set, when both key variables are set, when the key file cannot be read, or when the key
is not a usable RSA private key. Each command's envelope SHALL state whether it authenticated as an App or with
`gh`'s own credential, and SHALL NOT include any key, assertion or token.

Outside App mode, a repository whose owner has a token (per shared-stores) SHALL be read and written with that
token, and the envelope SHALL report `owner-token` and the owner for that repository. In App mode the owner tokens
directory SHALL NOT be read.

#### Scenario: Without App variables nothing changes
- **WHEN** none of the `CONTEXTURE_GITHUB_APP_*` variables is set
- **THEN** the commands call the forge through `gh` with the environment they were given, and the envelope
  reports `gh`'s own credential

#### Scenario: A partial App credential is refused
- **WHEN** `CONTEXTURE_GITHUB_APP_ID` is set and neither key variable is
- **THEN** the command exits with the setup/usage code naming `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and
  `CONTEXTURE_GITHUB_APP_PRIVATE_KEY`, before any forge call

#### Scenario: Two key sources are refused
- **WHEN** both `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` are set
- **THEN** the command exits with the setup/usage code naming both, rather than choosing one

#### Scenario: No secret reaches the envelope
- **WHEN** a command runs as an App with `--json`
- **THEN** its output contains no part of the private key, the signed assertion, or the installation token

#### Scenario: A mounted store's pull requests are read with its owner's token
- **WHEN** no App variable is set, a session has a part in mount `ctx-b`, the directory holds a file for
  `ctx-b`'s owner, and `ctxr review list --json` runs
- **THEN** `ctx-b`'s pull requests are read with that token, the envelope reports `owner-token` and the owner for
  `ctx-b`, and the output contains no part of the token

#### Scenario: App mode ignores owner tokens
- **WHEN** the App variables select App mode and `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names a directory holding a
  file for a mount's owner
- **THEN** every forge call uses the App's installation token, and the directory is not read
