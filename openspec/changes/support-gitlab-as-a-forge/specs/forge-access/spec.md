# Spec Delta

## Purpose
How a repository's forge is recognized, which credential a command uses to reach it, and what the command reports
about that credential, so that a store behaves the same whichever supported forge hosts it.

## ADDED Requirements

### Requirement: A repository's forge is recognized from its remote URL
A command that needs a forge SHALL decide which forge a repository is on from its `origin` URL as configured, or
from a mount's declared URL when the mount has no clone yet, in https or ssh form. Host `github.com` SHALL be
GitHub. The GitLab host SHALL be GitLab: the value of `CONTEXTURE_GITLAB_HOST`, and `gitlab.com` when it is
unset. No forge kind or host SHALL be read from `contexture.yaml`. The home store and each mount SHALL be
recognized separately.

#### Scenario: A gitlab.com store needs no host setting
- **WHEN** a store's `origin` is `https://gitlab.com/ctx-a/work.git` and `CONTEXTURE_GITLAB_HOST` is unset
- **THEN** its forge calls go to GitLab

#### Scenario: A self-managed host is GitLab when the environment names it
- **WHEN** a store's `origin` is `git@gitlab.example.com:ctx-a/work.git` and `CONTEXTURE_GITLAB_HOST` is
  `gitlab.example.com`
- **THEN** its forge calls go to GitLab at `gitlab.example.com`

#### Scenario: An unnamed host is not assumed to be GitLab
- **WHEN** a store's `origin` is on `gitlab.example.com` and `CONTEXTURE_GITLAB_HOST` is unset
- **THEN** no request is sent to `gitlab.example.com`'s API, and the store is handled as a repository on no
  recognized forge

#### Scenario: A GitHub store is unchanged
- **WHEN** a store's `origin` is on `github.com`, with or without the GitLab variables set
- **THEN** the credential resolved, the calls made and the envelope are the same as before

#### Scenario: A mount is recognized by its own URL
- **WHEN** a GitHub store mounts a store whose URL is on the GitLab host
- **THEN** `ctxr shared-stores sync` reaches the mount as a GitLab repository and the home store as a GitHub one

### Requirement: GitLab is reached with a token from the environment only
A command SHALL authenticate to GitLab with the token in the file `CONTEXTURE_GITLAB_TOKEN_FILE` names, or with
the text of `CONTEXTURE_GITLAB_TOKEN`, and with nothing else. It SHALL exit with the setup/usage code, naming the
variables and never a token, when both are set, when the file is unreadable or empty, or when it needs GitLab's
API and neither is set. The token SHALL be sent only to the GitLab host, over https.

#### Scenario: Two token sources are refused
- **WHEN** both `CONTEXTURE_GITLAB_TOKEN` and `CONTEXTURE_GITLAB_TOKEN_FILE` are set
- **THEN** the command exits with the setup/usage code naming both, before any request

#### Scenario: A missing token is named before any call
- **WHEN** `ctxr session submit` runs in a GitLab store with neither token variable set
- **THEN** it exits with the setup/usage code naming both variables, and nothing is pushed

### Requirement: Git's transport to GitLab uses the same token
Every `git` fetch, push, `ls-remote` and clone that ctxr runs against a GitLab repository SHALL authenticate with
the GitLab token when one is set, supplied to git for that one command from the process environment. The token
SHALL NOT appear in a remote URL, a git configuration file, or a command line. When no token is set, git SHALL
run with whatever credential it already has.

#### Scenario: A mount on GitLab is cloned with the token
- **WHEN** `ctxr shared-stores sync` clones an absent mount whose URL is on the GitLab host and a token is set
- **THEN** the clone authenticates with that token, and the mount's stored `origin` URL carries no credential

#### Scenario: Without a token git is left alone
- **WHEN** a GitLab store with an ssh `origin` is fetched and no token variable is set
- **THEN** git runs with its own credentials

### Requirement: A command reports the credential kind and never the credential
Every command that reports which forge credential it used SHALL report `gitlab-token` for a GitLab repository.
Its output, in text and in the `--json` envelope, SHALL NOT contain the token. A forge that cannot be reached
SHALL be reported in words that name the forge that was called.

#### Scenario: The envelope names the kind
- **WHEN** `ctxr review list --json` runs in a GitLab store
- **THEN** the envelope's credential is `gitlab-token`, and the output contains no part of the token

#### Scenario: An unreachable GitLab is not described as `gh`
- **WHEN** a forge call to GitLab fails to connect
- **THEN** the message names GitLab and its host, and does not name `gh`

### Requirement: A repository on no recognized forge is handled as before
A repository whose URL is on neither `github.com` nor the GitLab host SHALL be handled exactly as it was before
forge recognition existed, and no request SHALL be sent to its host's API on the guess that it is GitLab.

#### Scenario: A mirror keeps working
- **WHEN** a store's `origin` is a local bare repository and `CONTEXTURE_GITHUB_REPOSITORY` names its repository
- **THEN** the commands resolve the same credential and make the same calls as before

### Requirement: A GitLab project is addressed by its full path, without a forge CLI
A GitLab project SHALL be addressed by its full path, so a project in a subgroup is reachable. Reaching GitLab
SHALL NOT require any executable other than `git`.

#### Scenario: A project in a subgroup is reached
- **WHEN** a store's `origin` is `https://gitlab.com/ctx-a/team/work.git`
- **THEN** forge calls address the project `ctx-a/team/work`

#### Scenario: No forge CLI is needed
- **WHEN** a GitLab store's commands run on a host with `git` and without `gh` or `glab`
- **THEN** they succeed
