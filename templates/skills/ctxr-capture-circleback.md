Retrieve Circleback meetings for `ctxr-capture`. This skill is that skill's first step for one source: it works out
which meetings this store owes and writes each one into the inbox as the verbatim record, already carrying its
identity. Everything after retrieval is `ctxr-capture`'s, from its step 2.

One Circleback account can feed several stores, and a tag on each meeting says which store it belongs to. This
store's routing is in `settings.json` beside this file, rendered from the `circleback` block in `contexture.yaml`.

## 1. Retrieve

From the store root:

```
node __SKILLS_PATH__/ctxr-capture-circleback/sweep.mjs
```

It needs Circleback's command-line tool (`cb`) signed in, plus `git` and `gh`. A scheduled job runs it before you
start and puts its report in your prompt; then skip to step 2.

The runner reads every meeting from the last 35 days with its tags, and compares them with this store's default
branch and its open pull requests. A meeting is owed when it carries this store's tag, does not carry the decline
tag, carries no other store's tag, is not already in the store or an open pull request, and can still be read in
full. For each owed meeting it prepares a review-branch worktree and writes the record into `__INBOX_PATH__` there:
the meeting's metadata and attendees, Circleback's action items and summary (marked as the service's derivation),
and the transcript verbatim, with `source_type` and `source_id` stamped. It never writes the recording URL, which is
a signed, expiring link and so a credential.

The report is authoritative. Do not work the list out again yourself, and do not rebuild the files it wrote. If it
prints `COLLECTION FAILED`, report that line and stop.

## 2. Continue with `ctxr-capture`

For each file under RETRIEVED, follow `ctxr-capture` from its step 2, in the worktree:

- Step 2 checks the record. The runner copied the source through, so there is usually nothing to fix. What it
  cannot judge is the speakers: Circleback labels people generically and its summary can swap them, and step 2
  says what to note when it does.
- Step 3's identity is already stamped. Confirm it rather than writing it again.
- Step 4 is the dedupe check. If the verdict is not `new`, leave that file unstaged and report it.

## 3. Hand off, or stop at review

Interactively, finish with `ctxr-capture`'s step 5 on the same branch.

In a scheduled job no one is there to ingest, so stop at review instead. Stage exactly the capture files and
commit on the review branch. The store's commit hook is the validation; add no checks of your own on top of it.
Push the branch, and open a pull request against `__DEFAULT_BRANCH__` if none is open; a later run adds to the open
one. Its body lists each meeting (date, title, id) and says the captures still need an ingest. Never merge it.

## 4. Report

Give the counts (retrieved, already present), the pull request link, and the runner's other sections copied as
they are:

- **LOCKED**: tagged for this store but no longer readable in full, so it cannot be captured.
- **UNTAGGED**, **TAGGED FOR MORE THAN ONE STORE** and **DECLINED IN THE LAST 8 DAYS**, when the runner prints them.

If nothing was owed and every section is empty, say "Nothing missing".

## How a meeting is routed

- An untagged meeting is undecided, not skipped. It gets a tag in Circleback; ask the operator when the home is
  unclear.
- A meeting tagged for two stores is captured nowhere until the operator resolves it. A store that already holds it
  keeps it.
- Closing a capture pull request does not reject a meeting. Retagging it with the decline tag does.
- Circleback's free plan hides a meeting's full notes after about 30 days. The runner looks back 35 days, so a weekly
  run sees each meeting several times before then.
