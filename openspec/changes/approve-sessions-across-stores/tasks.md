## 1. Session identity and joined sessions

- [ ] 1.1 Add the session identity (home repository and branch) and write it into each session worktree at `ctxr session start`; report it in the command's output
- [ ] 1.2 Add `ctxr session start --joins <session>`: resolve the session in the mounting store, refuse outside a declared mount, an unknown session, or a taken branch; create the worktree on the home branch name
- [ ] 1.3 Add the session marker (write and parse) beside the decision marker; a missing or malformed marker means a session of one
- [ ] 1.4 Tests for joining, each refusal, and marker round-trips
- [ ] 1.5 Run `npx vitest run -t "session"` and confirm it exits 0

## 2. Finding a session's parts and their state

- [ ] 2.1 Group open pull requests on the home store and each present mount by session marker, reading each store's forge with the recording identity
- [ ] 2.2 Compute session-wide decision state: a session approval counts for a part only while every head in its marker is current or carried over; add `waiting` for a home part whose mounted parts are open, and `blocked` for a part closed unmerged
- [ ] 2.3 Read each mounted store's deciders from its `contexture.yaml` on its default branch on the forge
- [ ] 2.4 Make `ctxr review list` report each part's session and session-wide state
- [ ] 2.5 Tests with the fake forge: two stores, one session; a pushed part reopening both; a closed part blocking; deciders read from the forge
- [ ] 2.6 Run `npx vitest run -t "review list|session state"` and confirm it exits 0

## 3. The approval page

- [ ] 3.1 Add the `serve` fetch cache: one bare repository per store, outside the store, fetched on demand for the heads a page shows
- [ ] 3.2 Make `/approve/` list sessions across the home store and its mounts, once each, with each part's store, number, head and state; report an unreachable store and offer no decision on its sessions
- [ ] 3.3 Make the session page show every part under its store's heading, in landing order
- [ ] 3.4 Make the decision route take every part's head, refuse a moved head, a closed part, or a decider missing from any store's deciders, and record a review with the session marker on every part
- [ ] 3.5 Integration tests against the fake forge for each change-approval scenario in this change
- [ ] 3.6 Run `npx vitest run test/integration/serve-approve.test.ts` and confirm it exits 0

## 4. Landing

- [ ] 4.1 Make `ctxr land` hold a home part as `waiting` until its mounted parts have merged, without failing a sweep
- [ ] 4.2 Add `ctxr land --session <session> --confirm`: land mounted parts from their mounts, then the home part, stopping at the first failure and reporting landed, stopping and unattempted parts
- [ ] 4.3 Integration tests: waiting then landing across two sweeps; `--session` order; a conflict in the mounted part stopping the session
- [ ] 4.4 Run `npx vitest run -t "land"` and confirm it exits 0

## 5. Skills and end to end

- [ ] 5.1 Update `ctxr-session-lifecycle`: start a joined session inside a mount for the same piece of work
- [ ] 5.2 Update `ctxr-submit`: submit every part of a session, each with its marker, and hand off one approval link
- [ ] 5.3 Update `ctxr-land`: land by session with `--session` on an explicit go
- [ ] 5.4 Check edited skills for the banned tier words and flag attribution; rewrite touched steps to controlled English, keeping `Why:` sentences
- [ ] 5.5 End-to-end test: a note moved from `ctx-a` into its mount `ctx-b` as one session, approved once on `ctx-a`'s page, lands `ctx-b` first and then `ctx-a`
- [ ] 5.6 Run `npm run build && npx vitest run` and confirm both exit 0
- [ ] 5.7 Run `openspec validate approve-sessions-across-stores --strict` and confirm it reports the change valid
