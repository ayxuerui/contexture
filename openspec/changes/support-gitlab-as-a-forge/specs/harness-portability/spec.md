## ADDED Requirements

### Requirement: The land skill names no forge CLI
The rendered `ctxr-land` skill SHALL read a pull request's state through `ctxr session list --review`, and
through `ctxr review list` when the store declares change approval. It SHALL NOT name `gh`, `glab` or any other
forge's command-line tool as a command, so the same skill works on a store on any supported forge. A test over
the rendered skill SHALL fail when the skill names one.

#### Scenario: The land skill reads state through ctxr
- **WHEN** the land skill is rendered for a store on GitHub or on GitLab
- **THEN** its state-reading step runs `ctxr session list --review`, and the text names no `gh` or `glab`
  command
