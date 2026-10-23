## 1. Session identity and joined sessions

- [x] 1.1 Derive a session's identity (home forge slug and home branch) from its branch and repository; report it from `ctxr session start`
- [x] 1.2 Add `ctxr session start --joins <session>`: resolve the session in the mounting store, refuse outside a declared mount or an unknown session; create the worktree on `session/<owner>/<repo>/<home branch without prefix>`
- [x] 1.3 Add the session marker (write and parse) beside the decision marker; a missing or malformed marker means a session of one
- [x] 1.4 Make `ctxr session submit` append the marker to the body it composes, and refuse an agent body that already carries one
- [x] 1.5 Tests for joining, each refusal, marker round-trips, and submit's marker
- [x] 1.6 Run `npx vitest run -t "session"` and confirm it exits 0

## 2. Finding a session's parts and their state

- [ ] 2.1 Group open pull requests on the home store and each present mount by session marker, reading each store's forge with the recording identity
- [ ] 2.2 Compute session-wide decision state from the record part's review alone: valid only while every named head is current or carried over and no unnamed open part carries the marker; never mix decision ids; `blocked` for a named part closed unmerged, `retrying` for a transient landing failure
- [ ] 2.3 Read each mounted store's deciders from its `contexture.yaml` on its default branch on the forge
- [ ] 2.4 Make `ctxr review list` report each part's session and session-wide state
- [ ] 2.5 Tests with the fake forge: two stores, one session; a pushed part reopening both; a closed part blocking; deciders read from the forge
- [ ] 2.6 Run `npx vitest run -t "review list|session state"` and confirm it exits 0

## 3. The approval page

- [ ] 3.1 Fetch a mounted part's head into the mount's own clone under a private ref namespace, leaving its branches and working tree untouched
- [ ] 3.2 Make `/approve/` list sessions across the home store and its mounts, once each, with each part's store, number, head and state; show sessions homed elsewhere without a decision; report an unreachable store and offer no decision on its sessions
- [ ] 3.3 Make the session page show every part under its store's heading, in landing order
- [ ] 3.4 Make the decision route accept only sessions homed in this store; take every part's store, number and head; refuse a moved head, a closed part, a changed set of parts, or a decider missing from any store's deciders; post the record review first on the record part, then copies on the other parts, each with one decision id; report missing copies
- [ ] 3.5 Integration tests against the fake forge for each change-approval scenario in this change
- [ ] 3.6 Run `npx vitest run test/integration/serve-approve.test.ts` and confirm it exits 0

## 4. Landing

- [ ] 4.1 Make `ctxr land --pending` land each approved session homed here, mounted parts first in their mounts' clones under their own config, then the home part; skip pull requests homed elsewhere; bring each mount's clone up to date first; post a missing copy before merging a part; treat already-merged as landed; report `blocked` or `retrying` naming the part
- [ ] 4.2 Add `ctxr land --session <session> --confirm`: land mounted parts from their mounts, then the home part, stopping at the first failure and reporting landed, stopping and unattempted parts
- [ ] 4.3 Integration tests: one sweep landing both parts in order; a mounted store's sweep skipping a session homed elsewhere; a closed named part blocking; a rejected push retrying; a missing copy posted before landing; a session with no home part recording on its first part; already-merged counted as landed; `--session` order; a conflict stopping the session
- [ ] 4.4 Run `npx vitest run -t "land"` and confirm it exits 0

## 5. Skills and end to end

- [ ] 5.1 Update `ctxr-session-lifecycle`: start a joined session inside a mount for the same piece of work
- [ ] 5.2 Update `ctxr-submit`: run `ctxr session submit` in every part of a session, and hand off one approval link
- [ ] 5.3 Update `ctxr-land`: land by session with `--session` on an explicit go
- [ ] 5.4 Check edited skills for the banned tier words and flag attribution; rewrite touched steps to controlled English, keeping `Why:` sentences
- [ ] 5.5 End-to-end test: a note moved from `ctx-a` into its mount `ctx-b` as one session, approved once on `ctx-a`'s page, lands `ctx-b` first and then `ctx-a`
- [ ] 5.6 Run `npm run build && npx vitest run` and confirm both exit 0
- [ ] 5.7 Run `openspec validate approve-sessions-across-stores --strict` and confirm it reports the change valid
