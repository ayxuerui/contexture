## ADDED Requirements

### Requirement: `ctxr second-opinion` reports through the shared exit codes
`ctxr second-opinion preflight`, `critique` and `poll` SHALL exit `0` on a complete result, with the usage code for invalid arguments or fewer than two requested model CLIs, and with the failed-check code for a partial result or a preflight in which a requested CLI failed. With `--json` each SHALL print the standard envelope carrying the manifest. The command's options SHALL be contexture's own; the model CLIs' flags SHALL NOT appear among them.

#### Scenario: A partial critique is a failed check
- **WHEN** `ctxr second-opinion critique --plan-file plan.md` completes with one valid critique of three
- **THEN** it exits with the failed-check code and its `--json` envelope carries a manifest marked partial

#### Scenario: One CLI is not a second opinion
- **WHEN** `ctxr second-opinion critique --only claude --plan-file plan.md` is run
- **THEN** it exits with the usage code and no CLI is invoked
