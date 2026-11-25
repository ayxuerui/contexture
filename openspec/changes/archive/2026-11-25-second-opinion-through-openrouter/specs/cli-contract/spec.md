# Spec Delta

## ADDED Requirements

### Requirement: `--require-confinement` refuses only a run that would start a model CLI
With `--require-confinement` on a machine that cannot confine, `ctxr second-opinion preflight`, `critique` and `poll` SHALL proceed when every requested lineup entry resolves to OpenRouter, since no model CLI starts, and SHALL exit with the failed-check code naming the reason, before any critic starts or any request is made, when at least one requested entry resolves to its model CLI. The command's own check before launch enforces this, and a test covers both with stub CLIs and a stub endpoint.

#### Scenario: A run with no model CLI proceeds unconfined
- **WHEN** `ctxr second-opinion critique --require-confinement --only claude,codex --plan-file plan.md` runs where `setpriv` has no Landlock support, and both entries resolve to OpenRouter
- **THEN** both critics are answered through the stub endpoint, no model CLI is started, and the manifest still reports the machine as not confined with the reason

#### Scenario: One model CLI in the run is enough to refuse it
- **WHEN** the same command runs with one of the two entries resolving to its model CLI
- **THEN** it exits with the failed-check code naming the reason, no model CLI is started and no request is made
