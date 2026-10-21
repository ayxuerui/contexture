## ADDED Requirements

### Requirement: The recording identity may be a GitHub App with credentials from the environment only
The commands that read or record decisions (`ctxr serve`, `ctxr review list`, `ctxr land`) SHALL authenticate to
the forge as a GitHub App when the environment sets `CONTEXTURE_GITHUB_APP_ID` and exactly one of
`CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` (a path to a PEM file) or `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` (PEM
text). Otherwise they SHALL authenticate as `gh` does by itself. No key, key path or App ID SHALL be read from
`contexture.yaml`. A command SHALL exit with the setup/usage code, naming the variables involved, when only part
of the App credential is set, when both key variables are set, when the key file cannot be read, or when the key
is not a usable RSA private key. Each command's envelope SHALL state whether it authenticated as an App or with
`gh`'s own credential, and SHALL NOT include any key, assertion or token.

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

### Requirement: An App's installation token is minted on demand and replaced before it expires
In App mode, a command SHALL find the App's installation on the store's repository (the repository its `origin`
remote names) by asking the forge, using an assertion signed with the private key that is valid for no more than
ten minutes. It SHALL exchange that assertion for an installation token. It SHALL use one token for every forge
call until less than five minutes of the token's life remain, and SHALL then mint a new one before the next
call. When the App is not installed on that repository, the command SHALL exit with the setup/usage code,
naming the repository and the App. A long-running `ctxr serve` SHALL keep recording decisions across any
number of token lifetimes without a restart.

#### Scenario: A token is reused while fresh
- **WHEN** two forge calls are made one minute apart with a token that has fifty minutes of life left
- **THEN** both calls use the same token, and no new token is minted

#### Scenario: A token near expiry is replaced
- **WHEN** a forge call is made with a token that has four minutes of life left
- **THEN** a new token is minted first, and the call uses it

#### Scenario: An App not installed on the repository is named
- **WHEN** the App has no installation on the store's repository
- **THEN** the command exits with the setup/usage code, naming the repository and the App ID

### Requirement: An App's identity check uses the App's own record
In App mode, the start-time check that the server's forge credential is the configured recording login SHALL
compare `recording_login` with the App's slug followed by `[bot]`, as the forge reports the App's slug for the
signed assertion. That check SHALL NOT call the forge's current-user endpoint. `ctxr land`'s check of whether
its credential is the recording login SHALL use the same comparison.

#### Scenario: The App's bot login is the recording login
- **WHEN** the App's slug is `ctx-a-approvals` and `recording_login` is `ctx-a-approvals[bot]`
- **THEN** `ctxr serve` starts, and decisions it records are reviews by `ctx-a-approvals[bot]`

#### Scenario: A mismatched App is refused
- **WHEN** the App's slug is `ctx-a-approvals` and `recording_login` is `ctx-approvals`
- **THEN** `ctxr serve` exits non-zero before binding, naming `ctx-approvals` and `ctx-a-approvals[bot]`
