Parked, not applied. This change has no code; applying it is the archive, which syncs the delta into the main spec.

## 1. Verify and archive

- [x] 1.1 `openspec validate clarify-the-owned-skill-layout --strict` and `openspec validate --specs` pass.
- [x] 1.2 Archive with `openspec archive clarify-the-owned-skill-layout -y`.
- [x] 1.3 Confirm the end state: the requirement in `openspec/specs/harness-portability/spec.md` equals the delta's
      text (whitespace-normalised), it still has exactly 1 scenario, and every other requirement in that spec is
      byte-identical to before.
