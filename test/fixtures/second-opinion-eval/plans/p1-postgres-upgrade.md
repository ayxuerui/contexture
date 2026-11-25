# Plan: Upgrade the production Postgres from 14 to 17 with under 10 minutes of downtime

## Context
One primary and one streaming replica on our own VMs, 180 GB, serving a Rails app. Company policy requires a
hot standby for the production database at all times. The maintenance window is Sunday 02:00 UTC. Extensions
in use: pg_trgm, pgcrypto, postgis.

## Steps
S1. Announce the window on the status page 48 hours ahead.
S2. Provision a new VM `pg17-a` with Postgres 17 and the same extensions. Give it 8 vCPU instead of today's 16, because Postgres 17 cuts our query latency by 40%.
S3. Write a Python tool, `pgcopy`, that walks every table in primary-key order and copies rows to `pg17-a` in batches of 5,000, with a checkpoint table so it can resume after a crash.
S4. Run `pgcopy` against production during the week before the window. It stays current by re-copying rows whose `updated_at` is newer than its last pass over that table.
S5. Extend `pgcopy` with a driver interface so it can also copy from MySQL and SQL Server, for future migrations.
S6. At 02:00 Sunday put the app in maintenance mode and wait for `pgcopy` to report no rows left to copy.
S7. Run `ANALYZE` on `pg17-a`.
S8. Point `DATABASE_URL` at `pg17-a`, deploy, and take the app out of maintenance mode.
S9. Reset every sequence on `pg17-a` to the maximum id of its table plus one.
S10. Confirm the upgrade succeeded: the app's `/health` endpoint returns 200.
S11. At 03:00, once S10 passes, delete the old primary and replica VMs and their disks.

## Assumptions
- Every table has a primary key.
- The app tolerates ten minutes of maintenance mode.

## Reversibility
- Reversible: S1 to S10
- Irreversible: S11

=====KEY=====
A1 | architect | S9 | Sequences are reset (S9) only after the app is live on pg17-a (S8), so new inserts collide with existing ids; the reset must come before traffic resumes.
A2 | architect | S11 | No step builds a standby/replica for pg17-a, so after the old replica is deleted production runs with no hot standby, which the stated policy requires.
K1 | skeptic | S4 | pgcopy tracks changes only through updated_at: deleted rows are never removed on the target, and tables or writes that do not set updated_at are missed, so the copy silently diverges.
K2 | skeptic | S11 | The old primary and replica are destroyed one hour after cutover, removing the only rollback path before the new database has been proven under real traffic.
P1 | pragmatist | S3 | A hand-written row-copy tool reinvents what pg_upgrade, logical replication or pg_dump/restore already do.
P2 | pragmatist | S5 | Adding MySQL and SQL Server drivers to the copy tool is flexibility for future migrations this goal does not need.
V1 | verifier | S10 | A 200 from /health does not show the data arrived: nothing compares row counts or contents between old and new, so the check passes on an incomplete copy.
V2 | verifier | S2 | The "cuts our query latency by 40%" figure has no source or measurement, yet the VM is halved to 8 vCPU on the strength of it.
