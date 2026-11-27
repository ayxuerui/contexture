## 1. The gate

- [x] 1.1 Add `src/core/browse/identity-gate.ts`: `isLoopbackAddress`, and a gate that, given the loaded configuration and a request, answers admitted or refused with a reason; one verifier per distinct `identity` block (design.md D3, D5)
- [x] 1.2 In `src/commands/serve.ts`, read the bound address after `listen`, and run the gate after the webhook branch and before every other route, passing `/approve/` and `/plugin/` through; answer `401`, plain text, `no-store`, and write the reason to stderr (D4)
- [x] 1.3 Unit tests for `isLoopbackAddress` and the gate: no block, loopback, missing header, verified, a changed identity block

## 2. The served behaviour

- [x] 2.1 Integration tests (real CLI, real signatures) for each scenario in the delta spec except the configuration reload: every browsing route `401` on a wide bind, a verified non-listed email `200`, forged and wrong-audience `401`, loopback `200`, no block `200`
- [x] 2.2 Run `npx vitest run test/integration -t "serve"` and confirm it exits 0

## 3. Documentation and checks

- [x] 3.1 README: the browsing paragraph, the approval identity paragraph and the access-proxy paragraph say what is now checked, the loopback exemption, and the check to run from outside
- [x] 3.2 Run `npm run typecheck && npm test` and confirm both exit 0
- [x] 3.3 Run `openspec validate serve-browsing-requires-identity --strict` and confirm it reports the change valid
