# Plan: Replace the nightly full warehouse reload with incremental loads so dashboards are ready by 06:00

## Context
Today a full reload from production Postgres runs from 22:00 to 05:00. Dashboards must be current by 06:00 UTC.
The source is a read replica that can lag the primary by up to 15 minutes. Tables: `orders` (300 million rows;
has `updated_at`, stored as local Europe/Berlin time with no zone; cancelled orders are hard-deleted within 24
hours); `order_items` (900 million rows; no `updated_at`; rows never change but are deleted with their order);
`customers` (5 million rows; `updated_at` kept by a trigger); `exchange_rates` (about 20,000 rows; finance
corrects historical rates up to 30 days back). The revenue dashboard converts each order at the rate of its
order date. The warehouse runs in UTC. dbt and Airbyte are already deployed; Airbyte supports change data
capture from Postgres.

## Steps
S1. Add a `watermarks` table in the warehouse with one row per source table.
S2. Write a Python extractor: for each table, select the rows whose `updated_at` is greater than the table's watermark and upsert them into the warehouse.
S3. At the end of each run, set every watermark to the warehouse's `now()`.
S4. `order_items`: load the items of every order picked up in S2.
S5. `customers`: add soft-delete tracking and merge logic so that it loads incrementally too.
S6. `exchange_rates`: each night, load the rows whose rate date is yesterday.
S7. Build the extractor as a general incremental framework with pluggable sources, including Kafka, and pluggable transforms.
S8. Schedule the incremental job at 05:45. It will take about 20 minutes.
S9. Validate against the old pipeline for two weeks: after each night's runs, compare `count(*)` of `orders` between the full-reload table and the incremental table.
S10. Drop the full-reload DAG and its staging schema.
S11. Each month, reconcile the incremental tables against the full reload's staging schema.
S12. If the incremental job fails, it runs again the next night.

## Assumptions
- Every change to a row updates its `updated_at`.
- The warehouse can upsert 300 million-row tables efficiently.

## Reversibility
- Reversible: S1 to S9, S11, S12
- Irreversible: S10

=====KEY=====
A1 | architect | S2 | Incremental upserts never remove rows: cancelled orders (and their items) are hard-deleted at the source and stay in the warehouse forever, so revenue is overstated. No step handles deletes.
A2 | architect | S8 | A job that starts at 05:45 and takes about 20 minutes ends at about 06:05, after the 06:00 deadline the plan exists to meet.
A3 | architect | S11 | The monthly reconciliation (S11) depends on the full reload's staging schema, which S10 drops along with the DAG that fills it; the steps contradict each other.
K1 | skeptic | S3 | Setting the watermark to now() at the end of the run skips rows: the replica lags by up to 15 minutes and rows also change during the run, so changes committed before the watermark but not yet read are never loaded. Use the highest updated_at actually read, minus a margin, or the run's start time minus the lag.
K2 | skeptic | S2 | orders.updated_at is local Berlin time with no zone and the watermark is the warehouse's UTC now(); comparing them is off by one or two hours and is ambiguous at daylight-saving changes, so rows are skipped or reloaded.
K3 | skeptic | S6 | Loading only yesterday's exchange rates misses finance's corrections to rates up to 30 days back, so the revenue dashboard converts past orders at stale rates.
P1 | pragmatist | S2 | A hand-written extractor with watermarks reinvents Airbyte's change data capture, which is already deployed (and would also capture deletes).
P2 | pragmatist | S7 | A general framework with pluggable sources such as Kafka and pluggable transforms is built for needs this plan does not have.
P3 | pragmatist | S5 | customers (5 million rows) and exchange_rates (20,000 rows) are small enough to reload in full every night; incremental and soft-delete logic for them is machinery with no payoff.
V1 | verifier | S9 | Comparing only count(*) of orders cannot detect rows that exist in both tables with different values (missed updates, wrong amounts), and covers one table of four; it should compare sums or checksums per table.
V2 | verifier | S8 | "About 20 minutes" has no measurement behind it, and the schedule rests on it.
V3 | verifier | S12 | A failed run is only retried the next night and nobody is alerted: dashboards are silently a day stale, with no freshness check or alarm.
