## 1. Requesting-context resolution

- [ ] 1.1 Implement the resolution chain — explicit argument, environment variable, marker file with longest matching prefix, configured default — returning both the resolved context and the step that produced it, and preserving today's behavior when nothing resolves
- [ ] 1.2 Add the `doctor` report of what the store would resolve in the current directory, as a non-failing finding when nothing does, registered by appending one import and one array entry to the check manifest
- [ ] 1.3 Run `ctxr doctor --json` from a directory covered by a marker file and from one that is not — each reports the resolved context and the producing step, exits zero in both cases

## 2. Projection build

- [ ] 2.1 Implement the projection build over the combined pre-filter from `separate-scope-and-name-the-axes`, writing only admitted notes, their catalog sections, and the per-note records
- [ ] 2.2 Derive the projection's location from both the requesting context and the scope selector, and declare its root a derived path so it is gitignored at `init` and never staged
- [ ] 2.3 Make the output byte-stable and timestamp-free
- [ ] 2.4 Run the build twice unchanged — byte-identical output; run for two contexts and two scope selectors — four distinct locations, none serving another's request

## 3. Egress secret scan

- [ ] 3.1 Invoke the store's existing secret-pattern check over the content a projection is about to write, exiting non-zero naming the note and matched pattern class and writing nothing on a match
- [ ] 3.2 Add a test asserting a pattern added to configuration is enforced by both the commit path and the projection build, with no second pattern list anywhere
- [ ] 3.3 Run the projection build over a fixture note carrying a secret-shaped value — exits non-zero naming the note, and the projection root is absent

## 4. Adapter resolution

- [ ] 4.1 Refuse a declared adapter that resolves to no registered implementation, exiting non-zero naming the declaration, while leaving the unconfigured-kind degradation path untouched
- [ ] 4.2 Run a command against a store declaring a nonexistent adapter — exits non-zero naming the declaration; run the same command against a store declaring no adapter of that kind — degrades as documented and exits zero

## 5. Verify

- [ ] 5.1 Add the leak test: a fixture store with notes across three visibility values and a configured context mapping, asserting that a projection for one context contains the expected notes and that the entire projection tree, searched as raw text, contains no part of an excluded note's body
- [ ] 5.2 Add a parity test asserting the projection's note set for a context and scope equals the combined graph pre-filter's admitted set for the same pair
- [ ] 5.3 Run a session that builds a projection and then submits — the resulting pull request contains no projection files
- [ ] 5.4 Run `npm run build && npm run typecheck && npx vitest run` — all green
