# Plan: Build the pipeline that erases a user's data on request within 30 days

## Context
We receive about 400 erasure requests a month and the law gives us 30 days to complete each. A user's data
lives in: Postgres (`users`, `orders`); an Elasticsearch index; export files in an object bucket; the data
warehouse, which keeps daily snapshots for 90 days; the Kafka topics `user-events` (7-day retention) and
`user-profile` (log-compacted); database backups kept for 35 days; and the third-party Helpdesk service, which
holds support tickets with the user's email address. Tax law requires order records to be kept for 7 years;
they may be anonymised. Airflow is already in production for our data jobs.

## Steps
S1. Add a table `deletion_requests` with the user id, the request time and a status.
S2. Add an endpoint `POST /internal/delete-user?user_id=` that inserts a request. It needs no authentication, since it is reachable only from the internal network, and the support tool calls it.
S3. Build a workflow engine for the erasure steps: a state-machine library, a retry store and a status page.
S4. Run the engine's workers on a 12-node autoscaling Kubernetes job cluster so that the pipeline can keep up with demand.
S5. Postgres: delete the user's rows from `users` and from `orders`.
S6. Elasticsearch: delete the user's documents by user id.
S7. Bucket: delete everything under `exports/<user_id>/`.
S8. Warehouse: delete the user's rows from the current tables. The daily snapshots expire on their own within 90 days, which keeps us inside the deadline.
S9. Kafka: no action is needed, because events expire after 7 days.
S10. Backups: we do not edit backups. After any restore, re-run every request recorded in `deletion_requests` against the restored database.
S11. When a request has finished, delete its row from `deletion_requests`, so that we keep no trace of the user.
S12. Test the pipeline end to end in staging with a newly created user that has no orders, no exports and no events.
S13. Verify each request in production: after the workflow, query `users` for the user id and confirm it returns no rows.
S14. Extend the engine into a data-lifecycle platform with a policy language, so that retention rules for every table can be declared later.
S15. Send legal a weekly email with the number of requests completed that week.

## Assumptions
- The user id is enough to find all of a user's data in every store.
- Staging mirrors production's schema.

## Reversibility
- Reversible: S1 to S4, S12 to S15
- Irreversible: S5 to S9, S11

=====KEY=====
A1 | architect | S8 | Warehouse snapshots hold the user's data for up to 90 days, which is longer than the 30-day legal deadline; "inside the deadline" is false, so the plan does not meet its goal for the warehouse.
A2 | architect | S11 | S10 relies on the rows in deletion_requests to re-apply erasures after a restore, but S11 deletes each row when the request finishes, so after a restore there is nothing to re-run and erased users come back.
A3 | architect | S5 | The Helpdesk service, which holds tickets with the user's email address, is listed in the context and no step erases the user there.
K1 | skeptic | S5 | Hard-deleting the user's rows from orders breaks the 7-year tax retention requirement; orders must be kept and anonymised, not deleted, and the deletion cannot be undone.
K2 | skeptic | S9 | The `user-profile` topic is log-compacted, so the latest record for the user is kept indefinitely; "events expire after 7 days" holds only for `user-events`. A tombstone is needed.
K3 | skeptic | S2 | An unauthenticated endpoint that triggers irreversible deletion of any user by id: anything on the internal network (or a request forged through an internal service) can erase arbitrary users.
P1 | pragmatist | S3 | A custom workflow engine with retries and a status page reinvents Airflow, which is already in production.
P2 | pragmatist | S4 | A 12-node autoscaling cluster for about 400 requests a month (around 13 a day) is far more capacity than the job needs.
P3 | pragmatist | S14 | A data-lifecycle platform with a policy language is built for a future need, not for erasure requests.
V1 | verifier | S12 | The staging test uses a user with no orders, exports or events, so most erasure steps have nothing to delete and the test passes without exercising them.
V2 | verifier | S13 | The production check looks only at the `users` table; it says nothing about Elasticsearch, the bucket, the warehouse, Kafka or orders, so it passes when those steps failed.
V3 | verifier | S15 | A weekly count of completed requests does not show requests that are stuck, failed or nearing the 30-day deadline; nothing would alert anyone to a missed deadline.
