## 1. Config and defaults

- [x] 1.1 `src/config/schema.ts`: remove `IdentitySchema` and the `identity:` field from `StoreConfig`; remove `'identity-injection'` from `AdapterKindSchema`.
- [x] 1.2 `src/config/defaults.ts`: remove the identity path default(s).
- [x] 1.3 Typecheck after this group — every downstream consumer of `config.identity` should now be a compile error, giving an exhaustive list for the remaining groups.

## 2. Adapters contract

- [x] 2.1 `src/adapters/types.ts`: remove `IdentityInjectionAdapter`; remove `'identity-injection'` from `AdapterKind`, `SUPPORTED_ADAPTER_INTERFACE_VERSION`, and `AdapterForKind`.
- [x] 2.2 `src/adapters/builtin/index.ts`: remove the stale comment referencing identity-injection and the (now nonexistent) agent-identity AGENTS.md section.
- [x] 2.3 `src/commands/adapters-generate.ts`: remove the identity-injection adapter generation loop and its fence helper.
- [x] 2.4 `src/run.ts`: update the `adapters` command's description to drop "identity-injection" from the list of adapter kinds it (re)generates.
- [x] 2.5 Grep the full source tree for the literal string `identity-injection` after this group — zero remaining matches.

## 3. Core identity module and its call sites

- [x] 3.1 Delete `src/core/identity.ts`.
- [x] 3.2 Delete `src/core/checks/identity-checks.ts`.
- [x] 3.3 `src/core/checks/manifest.ts`: remove the `IDENTITY_CHECKS` import and registration.
- [x] 3.4 `src/core/write-lifecycle/path-gate.ts`: remove the identity-path exclusion (the `config.identity.path` / `identityFilePaths(config)` entries in its exclusion list).
- [x] 3.5 `src/core/reconcile.ts`: remove the `ensureIdentityFiles` import and its call from the update/reconcile flow.
- [x] 3.6 `src/commands/init.ts`: remove the `ensureIdentityFiles` import and call, the `identity:` default written into a fresh `contexture.yaml`, and identity paths from the list of files `init` reports as created.
- [x] 3.7 `src/core/errors.ts`: remove the `identity.entry_match` and `identity.unknown_role` error codes.

## 4. Identity command group

- [x] 4.1 Delete `src/commands/identity.ts`.
- [x] 4.2 `src/run.ts`: remove the `identity` command group registration (`add`/`replace`/`remove`) and its import.
- [x] 4.3 `openspec/specs/cli-contract/spec.md`: check whether the command-surface list names `identity` explicitly; update if so.

## 5. AGENTS.md generation

- [x] 5.1 `src/core/agents-doc.ts`: remove `AGENTS_MD_IDENTITY_FENCE` and the "Agent identity — load at session start" section generation, and its import of `identityFilePaths`.
- [x] 5.2 Confirm no other generated section of `AGENTS.md` references identity (the conventions index, the procedure index, the retrieval section are all independent).

## 6. Session capture narrows to store notes

- [x] 6.1 `src/commands/session-capture.ts`: remove the identity-delta application (former Blocks B/C: world-facts/user-facts), narrowing the command to store notes only.
- [x] 6.2 The command SHALL reject a proposal file that declares a `world_facts` or `user_facts` top-level key with a clear validation error, per `design.md`'s Decisions — not silently ignore it.
- [x] 6.3 `src/core/procedures.ts`: remove the world-facts/user-facts proposal template content and identity-path references from the generated session-capture skill; update the shipped-skills description if it names identity content.

## 7. Specs

- [x] 7.1 `openspec validate --strict` on this change — must pass, including the four delta specs (`agent-identity` full removal, `adapters`, `write-lifecycle`, `harness-portability`).
- [x] 7.2 After archive: deleted `openspec/specs/agent-identity/spec.md` and its now-empty directory by hand — the archive skill's step 5 in this schema is a plain directory move, not a spec-merging `openspec archive` CLI call, so the delta sync (and this deletion) had to be done manually against the moved change's delta specs before the merge would exist anywhere.
- [x] 7.3 After archive: hand-edited `openspec/specs/adapters/spec.md`'s `## Purpose` to drop "identity injection" from the list of extension-point kinds and correct "fourth kind" to "third kind".

## 8. Tests

- [x] 8.1 Delete `test/unit/identity.test.ts`, `test/unit/identity-checks.test.ts`, `test/unit/identity-command.test.ts`.
- [x] 8.2 Delete or trim `test/integration/agent-identity-and-adapters.test.ts` — keep any adapter-general assertions that don't depend on identity-injection specifically, drop the rest.
- [x] 8.3 Trim `test/unit/session-capture.test.ts` to store-notes-only cases; add a case for task 6.2's rejection behavior.
- [x] 8.4 Trim `test/unit/adapters-registry.test.ts`, `test/unit/path-gate.test.ts`, `test/unit/procedures.test.ts`, `test/unit/agents-doc.test.ts`, `test/unit/git-sequence.test.ts` — remove identity-specific cases, keep everything else. Also found and trimmed `test/unit/update-command.test.ts` (referenced the literal `.contexture/identity/` path directly, missed by the initial grep since it didn't name a removed API).
- [x] 8.5 `npm run build && npm run typecheck && npx vitest run` — full suite green, no skipped files left with a dangling import.

## 9. Version and release

- [x] 9.1 Bump `package.json` and `src/version.ts` together to `0.3.0` (both files, per the lesson from the 0.2.0 release where only one was bumped).
- [ ] 9.2 PR body names this as a breaking change and links the migration steps in `design.md`'s Migration Plan. Deferred until the PR is actually opened — not done in this pass since the branch isn't pushed yet.

## 10. Land it

- [x] 10.1 Committed on this branch (`remove-agent-identity`). Not pushed — waiting for an explicit go-ahead before pushing or opening a PR, per this session's established pattern.
