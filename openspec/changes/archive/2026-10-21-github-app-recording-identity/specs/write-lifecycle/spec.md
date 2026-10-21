## ADDED Requirements

### Requirement: In App mode, landing's git transport authenticates as the App
When `ctxr land` runs with a GitHub App credential (as change-approval defines it), every `git fetch` and
`git push` it performs against the store's `origin` SHALL authenticate with the App's current installation
token, so the command needs no other git credential. The token SHALL reach git only through the environment
of that one git process, read by a credential helper that the command passes on the command line. It SHALL NOT
be written into a remote URL, into any git configuration file, or into the command's output. Without an App
credential, `ctxr land` SHALL use whatever credential git already has, as before.

#### Scenario: A runner with only the App credential lands
- **WHEN** `ctxr land --pending` runs with the App variables set, no `GH_TOKEN`, and no git credential
  configured for `origin`
- **THEN** it fetches, pushes a carried-over rebase, and merges an approved pull request

#### Scenario: The token is never stored
- **WHEN** `ctxr land` has pushed as the App
- **THEN** `git remote get-url origin`, the repository's git configuration files and the command's output
  contain no part of the installation token
