## 1. `ctxr sync`

- [ ] 1.1 Add `src/commands/sync.ts`: take landing's repository lock, fetch the default branch through landing's authenticated fetch, apply `fastForwardIfSafe`, report the outcome as `canonical_sync`; exit with the setup/usage code when the fetch fails
- [ ] 1.2 Register `ctxr sync` in `src/run.ts`
- [ ] 1.3 Integration tests against a local bare origin: behind clone fast-forwarded; dirty, wrong-branch and diverged clones left alone with the success code; unreachable origin exits with the setup/usage code; nothing under `shared/` touched
- [ ] 1.4 Run `npx vitest run -t "ctxr sync"` and confirm it exits 0

## 2. `serve.sync_minutes`

- [ ] 2.1 Add `sync_minutes` (positive integer) to the `serve` block of `StoreConfigSchema`; absent resolves to 5 from a constant in `config/defaults.ts`
- [ ] 2.2 Unit tests: absent means 5; 0, negative and fractional values are refused naming the key
- [ ] 2.3 Run `npx vitest run test/unit/config-schema.test.ts` and confirm it exits 0

## 3. The store-update runner

- [ ] 3.1 Generalize `core/approval/lander.ts` into a store-update runner that runs `land --pending` when the loaded configuration turns landing on and `sync` otherwise, with the interval from `serve.sync_minutes`, never two at once, output prefixed by the run
- [ ] 3.2 Make `serve` always start the runner and re-read the run kind and interval when the configuration reloads
- [ ] 3.3 Integration tests: a store without `change_approval` serves a change merged on the origin after one interval; a store with approval runs only landing; a failing run leaves routes unchanged
- [ ] 3.4 Run `npx vitest run -t "serve"` and confirm it exits 0

## 4. Docs and end to end

- [ ] 4.1 README: `ctxr sync` in the command reference; the serving section says `serve` follows the default branch every `serve.sync_minutes`
- [ ] 4.2 Run `npm run build && npx vitest run` and confirm both exit 0
- [ ] 4.3 Run `openspec validate serve-keeps-its-clone-current --strict` and confirm it reports the change valid
