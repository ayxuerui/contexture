## ADDED Requirements

### Requirement: Every remote git operation ctxr runs uses the repository's forge credential
Every fetch, push, `ls-remote` and clone that a ctxr command runs against a store's or mount's repository SHALL
authenticate with that repository's forge credential, as landing does: in App mode the App's token, with an owner
token (per shared-stores) that token, and otherwise whatever credential git already has. This SHALL include
`ctxr session start`'s fetch of the default branch, `ctxr session submit`'s push, and `ctxr update`'s `ls-remote`.

#### Scenario: A session in a mount owned by another owner starts from the forge's default branch
- **WHEN** the directory holds a file for the owner of mount `ctx-b`, `gh`'s own credential cannot read
  `ctx-b`'s repository, and `ctxr session start` runs inside `shared/ctx-b`
- **THEN** the fetch succeeds with the owner's token, and the session is cut from the forge's default branch

#### Scenario: A session in such a mount is submitted
- **WHEN** a session in `shared/ctx-b` has a commit and `ctxr session submit` runs
- **THEN** the branch is pushed and the pull request opened on `ctx-b`'s repository with the owner's token

## MODIFIED Requirements

### Requirement: In App mode, landing's git transport authenticates as the App
When `ctxr land` runs with a GitHub App credential (as change-approval defines it), every `git fetch` and
`git push` it performs against the store's `origin` SHALL authenticate with the App's current installation
token, so the command needs no other git credential. The token SHALL reach git only through the environment
of that one git process, read by a credential helper that the command passes on the command line. It SHALL NOT
be written into a remote URL, into any git configuration file, or into the command's output. Without an App
credential, `ctxr land` SHALL use whatever credential git already has, as before, unless the repository's owner
has a token (per shared-stores), which SHALL then reach git the same way the App's token does.

#### Scenario: A runner with only the App credential lands
- **WHEN** `ctxr land --pending` runs with the App variables set, no `GH_TOKEN`, and no git credential
  configured for `origin`
- **THEN** it fetches, pushes a carried-over rebase, and merges an approved pull request

#### Scenario: The token is never stored
- **WHEN** `ctxr land` has pushed as the App
- **THEN** `git remote get-url origin`, the repository's git configuration files and the command's output
  contain no part of the installation token

#### Scenario: A mounted part lands with its owner's token
- **WHEN** no App variable is set, the directory holds a file for the owner of mount `ctx-b`, and
  `ctxr land --session <session> --confirm` lands a session with a part in `ctx-b`
- **THEN** the fetch, any push and the merge for `ctx-b`'s part use the owner's token, and the home part uses
  `gh`'s own credential
