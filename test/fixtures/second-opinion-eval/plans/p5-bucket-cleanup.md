# Plan: Halve the storage bill of the media bucket by deleting files we can regenerate

## Context
The S3 bucket `acme-media-prod` holds 310 TB and costs $7,100 a month. Bucket versioning is enabled. Objects
live under `orig/` (uploads), `derived/` (thumbnails and transcodes) and `tmp/` (upload scratch files). Since
2023 the pipeline keeps each upload in `orig/`; before that it replaced the upload with its transcode.
Deleting `derived/` and `tmp/` will bring the bill down to about $3,500.

## Steps
S1. Write a script that lists every object with paginated `ListObjectsV2` calls and loads key, size and date into a SQLite file.
S2. Select the candidates: every object under `derived/` and `tmp/` last modified more than 90 days ago.
S3. Delete the candidates with a script that calls `DeleteObjects` in batches of 1,000 on 64 threads.
S4. So that whoever is on call can run it, put an IAM access key with delete rights in the script and commit it to the tools repository.
S5. Ask the media team which `derived/` prefixes live products still link to.
S6. Add a lifecycle rule that expires `tmp/` objects after 7 days.
S7. Build a cost-attribution service that tags every object with its owning team and produces a daily cost report per team, so later cleanups can be targeted.
S8. Confirm the saving: the delete script prints how many `DeleteObjects` calls returned 200, and that number matches the number of batches.

## Assumptions
- Anything under `derived/` can be produced again from `orig/`.
- Nothing reads `tmp/` objects older than 90 days.

## Reversibility
- Reversible: S1, S2, S5 to S8
- Irreversible: S3

=====KEY=====
A1 | architect | S3 | With versioning enabled, DeleteObjects without version ids only adds delete markers; the old versions remain and are still billed, so the plan does not reduce storage. It needs noncurrent-version expiry or deletes by version id.
A2 | architect | S5 | The media team is asked which derived/ prefixes are still in use (S5) after the deletion (S3); the question must be answered before deleting.
K1 | skeptic | S2 | The assumption that all of derived/ can be regenerated is false for uploads before 2023, where the original was replaced by its transcode; for those the derived object is the only copy.
K2 | skeptic | S4 | An IAM access key with delete rights is embedded in a script and committed to a repository.
P1 | pragmatist | S1 | A custom listing script and SQLite load reinvents S3 Inventory (or Storage Lens), which already reports keys, sizes and dates.
P2 | pragmatist | S7 | A cost-attribution service with per-team tagging and daily reports is an adjacent project, not needed to delete these files.
V1 | verifier | S8 | Counting DeleteObjects calls that returned 200 does not show storage or cost went down (and with versioning it passes while nothing is freed); the check should read bucket size or the bill.
V2 | verifier | S2 | The claim that deleting derived/ and tmp/ brings the bill to about $3,500 has no measurement of how much of the 310 TB those prefixes hold.
