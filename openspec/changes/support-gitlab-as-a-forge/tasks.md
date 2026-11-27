## 1. Confirm the forge's behavior

- [x] 1.1 Check against GitLab's current API reference, and correct design.md where it differs: merge request
      create / list by source branch / update / close; notes list and create, and how system notes are marked;
      merge with `sha` and `squash`; the merge-status values that mean "still checking"; raw file at a ref;
      `GET /user` for personal, project and group access tokens; https git with `oauth2:<token>`; webhook
      headers and the push and merge-request payload fields for branch and project; the noreply address form.
- [x] 1.2 Check GitLab's path rules for `--` inside a group or project path (design D7).
- [x] 1.3 Read how a joined session's branch and directory name are parsed (`approval/session-marker.ts`,
      `core/session.ts`) and settle the n-segment split before changing the grammar.

## 2. Forge recognition and credentials

- [x] 2.1 Add a forge resolver: URL → kind (`github`, `gitlab`, none), host, slug; `CONTEXTURE_GITLAB_HOST`.
- [x] 2.2 Add the `gitlab-token` credential kind: the two variables, the refusals, `gitToken`, `derivedSecret`.
- [x] 2.3 Confirm `runRemoteGit`'s helper serves GitLab unchanged (GitLab accepts any non-empty username with a
      token as the password, per 1.1), and test that the token reaches git only through the environment.
- [x] 2.4 Add one factory returning the client and credentials for a repository, and move the seven
      `createGhForgeClient` call sites and `storeForges` onto it.
- [x] 2.5 Unit tests: recognition (https, ssh, subgroup, unnamed host, GitHub unchanged), token refusals, no
      token in any envelope.

## 3. GitLab client

- [x] 3.1 Implement `ForgeClient` over `fetch` for GitLab: `login`, `pull`, `openPulls`, `pullsForHead`,
      `createPull`, `updatePull`, `comments`, `createComment`, `merge`, `fileAt`, with pagination.
- [x] 3.2 Map errors to `ForgeRequestError` with the HTTP status; name GitLab and its host in
      `ForgeUnreachableError` text.
- [x] 3.3 Tests against a stub HTTP server covering each call and a 404 `fileAt`.

## 4. Sessions

- [x] 4.1 `session submit`, `session list --review`, `session discard --close-pull-request` on a GitLab store.
- [x] 4.2 Accept slugs of two or more segments in session and decision markers; keep two-segment output
      byte-identical.
- [x] 4.3 Refuse `session start --joins` when either store is on GitLab and the two are not on one forge and
      host. Split a joined worktree name on every `--` on GitLab (1.2: its paths cannot hold one), as before
      elsewhere.
- [x] 4.4 Fallback committer address per forge in `session/commit.ts`.

## 5. Approval and landing

- [x] 5.1 Decision records through the client: `reviews()` returns reviews on GitHub and non-system notes on
      GitLab, so `review list`, `land` and the approval routes read both with the one existing reader.
- [x] 5.2 Record a decision as a note on GitLab; read it back for the response.
- [x] 5.2a Mirror: approve for the head after an approving note; withdraw the approval after a request for
      changes; a refused mirror call is reported and leaves the decision standing. Confirm in 1.1 the approve
      and unapprove calls, the `sha` parameter, and which token scopes and roles they need.
- [x] 5.3 Start-time and `land` recording-login checks against the token's username.
- [x] 5.4 Merge with `sha` and `squash`; refuse `merge_method: rebase` on a GitLab store in `serve` and `land`.
- [x] 5.5 Tests: marker from another user ignored, GitLab approval ignored, moved head not merged, GitHub
      comment marker still ignored.

## 6. Webhook

- [x] 6.1 `POST /hooks/gitlab` with constant-time `X-Gitlab-Token` comparison; hints from push and
      merge-request events.
- [x] 6.2 Expose only the store's forge's route; the other answers `405`.

## 7. Skills and checks

- [x] 7.1 `templates/skills/ctxr-land.md`: read state with `ctxr review list --json`; add the render test.
- [x] 7.2 Confirm `ctxr verify` and the environment probe do not require `gh` for a GitLab store.
- [x] 7.3 Check what `ctxr-capture-circleback` uses `gh` for and whether it holds on a GitLab store; report,
      do not change it here. Found: its runner (`sweep.mjs`) calls `gh pr list` and `gh pr diff` itself, so the
      opt-in Circleback capture does not work on a GitLab store. Left for a change of its own.
- [x] 7.4 Check the banned-word and flag-attribution rules before editing skill prose.

## 8. Documentation and images

- [x] 8.1 README: the three variables, which token to use for `serve` and for an agent, token expiry, webhook
      setup in GitLab, the limits in design.md's Non-Goals.
- [ ] 8.2 contexture-images (separate pull request): pass `CONTEXTURE_GITLAB_HOST` and the token to `serve` as a
      secret file and to the agents container from the member's own token; never the `serve` token to agents.

## 9. Verify

- [x] 9.1 `npm test`, `npm run typecheck`, `openspec validate support-gitlab-as-a-forge --strict`.
- [ ] 9.2 End to end against a scratch gitlab.com project: start, submit, approve, land, webhook delivery.
