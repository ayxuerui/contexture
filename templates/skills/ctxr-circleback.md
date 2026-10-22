Capture the Circleback meetings this store owes, on a review branch, without deciding the list by hand. One
Circleback account can feed several stores, and a tag on each meeting says which store it belongs to. This store's
routing is in `settings.json` beside this file, rendered from the `circleback` block in `contexture.yaml`.

## When

On a request such as "sweep Circleback" or "capture my meetings", and from a scheduled job. A scheduled job runs the
runner before you start and puts its report in your prompt, so begin at step 2.

## 1. Run the runner

From the store root:

```
node __SKILLS_PATH__/ctxr-circleback/sweep.mjs
```

It needs Circleback's command-line tool (`cb`) signed in, plus `git` and `gh`. It reads every meeting from the last
35 days with its tags, compares them with this store's default branch and its open pull requests, and prints a report.
When the store owes any meeting, it also prepares a review-branch worktree and writes each owed meeting's capture into
`__INBOX_PATH__` there, under CAPTURES RENDERED.

The report is authoritative. Do not work the list out again yourself, and do not rebuild the files it wrote. If it
prints `COLLECTION FAILED`, report that line and stop.

What the runner writes is the mechanical part of a capture: the source type and id, the meeting's metadata, its
attendees, Circleback's action items and summary (marked as the service's derivation, not the record), and the
transcript verbatim. It never writes the recording URL, which is a signed, expiring link and so a credential.

## 2. Add the judgment

For each file under CAPTURES RENDERED, read it, and after `## Attendees` add a `### Speaker caveat` when the speaker
labels cannot be trusted: generic "Participant N" labels, or a summary that gives a position or a role to the wrong
person. Say what is unreliable. Name who a label most likely is only where the transcript itself makes it clear.

Never edit the transcript or Circleback's summary, and never add `source_hash` or `ingested`; ingest assigns both.

Then, from the worktree, run `ctxr source check <file> --source-id circleback/<id>`. If the verdict is not `new`,
leave that file unstaged and report it.

## 3. Publish

Stage exactly the capture files and commit on the review branch. The store's commit hook is the validation; add no
checks of your own on top of it. Push the branch, and open a pull request against `__DEFAULT_BRANCH__` if none is
open; a later run adds to the open one. Its body lists each meeting (date, title, id) and says the captures still need
an interactive ingest through `ctxr-ingest-orchestration`.

Never merge the pull request and never ingest here.

## 4. Report

Give the counts (captured, already present), the pull request link, and the runner's other sections copied as they
are:

- **LOCKED** — tagged for this store but no longer readable in full, so it cannot be captured.
- **UNTAGGED**, **TAGGED FOR MORE THAN ONE STORE** and **DECLINED IN THE LAST 8 DAYS**, when the runner prints them.

If nothing was owed and every section is empty, say "Nothing missing".

## How a meeting is routed

- A meeting is this store's when it carries this store's tag, does not carry the decline tag, and carries no other
  store's tag.
- An untagged meeting is undecided, not skipped. It gets a tag in Circleback; ask the operator when the home is
  unclear.
- A meeting tagged for two stores is captured nowhere until the operator resolves it. A store that already holds it
  keeps it.
- Closing a capture pull request does not reject a meeting. Retagging it with the decline tag does.
- Circleback's free plan hides a meeting's full notes after about 30 days. The runner looks back 35 days, so a weekly
  run sees each meeting several times before then.
