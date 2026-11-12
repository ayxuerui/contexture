## ADDED Requirements

### Requirement: `ctxr second-opinion --print` returns the answers on stdout
`ctxr second-opinion critique --print` and `ctxr second-opinion poll --print` SHALL write no output directory and SHALL print each answer's text on stdout: a critique's under its letter, in letter order, followed by the table attaching each letter to its role and the model reported; a poll's under its model. Exit codes SHALL be those of the same run without `--print`. With `--json` the envelope SHALL carry the texts beside the manifest. `--print` together with `--out` SHALL be a usage error.

#### Scenario: A printed critique leaves no files
- **WHEN** `ctxr second-opinion critique --print --plan-file plan.md` completes with three valid critiques
- **THEN** stdout carries critiques A, B and C in that order and then the letter table, it exits `0`, and no `ctxr-second-opinion-out-*` directory was created

#### Scenario: Print and out together are refused
- **WHEN** `ctxr second-opinion poll --print --out answers --prompt-file q.md` is run
- **THEN** it exits with the usage code and no model CLI is invoked

### Requirement: `ctxr second-opinion --require-confinement` refuses an unconfined run
With `--require-confinement`, `ctxr second-opinion preflight`, `critique` and `poll` SHALL exit with the failed-check code, naming the reason, before any model CLI starts, where the run cannot be confined.

#### Scenario: Confinement can be required
- **WHEN** `ctxr second-opinion critique --require-confinement --plan-file plan.md` runs where `setpriv` has no Landlock support
- **THEN** it exits with the failed-check code naming the reason, and no model CLI is invoked
