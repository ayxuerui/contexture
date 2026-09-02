## ADDED Requirements

### Requirement: Adapters are discovered through one declared registration mechanism
An adapter SHALL be discoverable via a declared registration mechanism, resolved by kind and id against a registry, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code. A declaration that does not resolve to a registered adapter SHALL be refused rather than silently ignored.

#### Scenario: An unresolvable adapter declaration is refused
- **WHEN** a registered adapter's (kind, id) pair matches no built-in adapter
- **THEN** resolving it exits non-zero naming the kind and id, rather than registering nothing and continuing silently

### Requirement: Core documents its behavior when an adapter of a relevant kind is absent
Every core command SHALL define and document its behavior when no adapter of a relevant kind is configured, and that behavior SHALL be a documented degradation, not a crash or a silent no-op.

#### Scenario: No harness-generation adapter configured
- **WHEN** no harness-generation adapter is configured
- **THEN** `ctxr adapters generate` exits zero and reports zero files changed, rather than crashing or producing no report at all

## REMOVED Requirements

### Requirement: One contract for every adapter kind
**Reason**: This requirement's defining scenario, "Two adapter kinds share the same discovery mechanism," described `harness-generation` and `forge` adapters sharing one registration mechanism. With `forge` removed, only one kind remains, and that scenario can no longer be written truthfully. The underlying principle — one declared registration mechanism, refusing what it can't resolve — is restated under "Adapters are discovered through one declared registration mechanism" with a scenario grounded in the mechanism's existing refusal behavior rather than in a second kind that no longer exists.
**Migration**: None — the mechanism itself is unchanged; only the illustrative scenario moves to the replacement requirement.

### Requirement: Core never depends on an adapter being present
**Reason**: This requirement's only scenario, "No forge adapter configured," described `contexture session submit`'s degradation when no forge adapter was configured. Both the command and the adapter kind are removed in this change. The general principle — every core command documents its behavior with a relevant adapter absent — is restated under "Core documents its behavior when an adapter of a relevant kind is absent" with a scenario grounded in `ctxr adapters generate`'s existing behavior against the one remaining adapter kind.
**Migration**: None — `ctxr session submit` is gone; store-scope validation is now `ctxr doctor`, run directly by the `ctxr-submit` skill regardless of adapter configuration.

### Requirement: Forge adapters read state and merge
**Reason**: The forge adapter kind is removed. The GitHub `gh`-wrapping adapter it described was the only implementation this interface ever had, and its two consumers — `ctxr session land`'s state query and merge — are removed in the same change. Pull-request state reads and merges are now `gh pr view` and `gh pr merge`, run directly by the `ctxr-land` skill, which is free to use `gh`'s actual vocabulary instead of an interface designed to abstract over a second forge that was never built.
**Migration**: Run `gh pr view <n> --json number,url,title,state,mergeable,headRefName` and `gh pr merge <n> --<method>` directly, as the rewritten `ctxr-land` skill instructs.
