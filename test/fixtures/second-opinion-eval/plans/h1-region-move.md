# Plan: Move the `ledger` service from eu-west-1 to eu-central-1 with at most 30 minutes of downtime

## Context
`ledger` runs on Kubernetes: 12 API pods, 6 worker pods, and several CronJobs, including nightly invoicing at
23:00 UTC. Data: a 1.1 TB Postgres primary with one replica; a Redis instance that serves as the cache and as
the durable job queue the workers consume; an object bucket of 4 TB that changes by about 30 GB a day. The two
regions are joined by a dedicated 1 Gbit/s link. Recovery point objective is 5 minutes. Forty enterprise
customers allowlist our egress NAT addresses for the webhooks we send them, and their contracts require 10
business days' notice of a change. Alert rules select on the label `region="eu-west-1"`. The team uses
Terraform for all infrastructure, kustomize for deploys, and Velero for cluster backups. The cutover window is
Saturday 22:00 to 22:30 UTC.

## Steps
S1. Apply the existing Terraform modules to create the network and the Kubernetes cluster in eu-central-1.
S2. Create new NAT gateways there with new elastic addresses.
S3. On the Thursday before the cutover, email the forty enterprise customers the new egress addresses.
S4. Create a cross-region streaming replica of the Postgres primary in eu-central-1.
S5. Write a Go program that lists the bucket and copies objects to a new eu-central-1 bucket on 200 goroutines, recording progress in a DynamoDB table so it can resume.
S6. Start the initial bucket copy on Saturday at 19:00. Copying 4 TB over the 1 Gbit/s link takes about 2 hours, so it finishes well before the window.
S7. Replace the kustomize deploy pipeline with a new Helm-based one, since Helm suits multi-region better, and use it for the new cluster.
S8. Deploy all `ledger` manifests to the new cluster with the API and worker Deployments scaled to 0.
S9. Provision a new, empty Redis in eu-central-1. Redis holds only cache, so nothing needs to be carried over.
S10. Copy the Kubernetes secrets: export them to YAML and attach the file to the migration ticket so anyone on the team can apply them to the new cluster.
S11. Write a backup operator for the new cluster that snapshots volumes and resources on a schedule.
S12. Two days before the cutover, lower the DNS TTL of `api.ledger.example` from 3600 to 60 seconds.
S13. At 22:00 on Saturday, put up the maintenance page in front of the API in eu-west-1.
S14. Confirm the replica is ready to take over: `SELECT pg_is_in_recovery()` on it returns true.
S15. Promote the eu-central-1 replica to primary.
S16. Scale the API and worker Deployments in eu-west-1 to 0.
S17. Run the bucket copy program once more to pick up the last changes.
S18. Scale the API to 12 pods and the workers to 6 pods in eu-central-1.
S19. Point `api.ledger.example` at the new load balancer and take down the maintenance page.
S20. If anything looks wrong in the first hour, roll back: point DNS at eu-west-1 again and scale its Deployments back up.
S21. At 23:30, delete the eu-west-1 Postgres primary, its replica, the Redis instance and the cluster.
S22. Create a streaming replica of the new primary in eu-central-1 the following week.

## Assumptions
- eu-central-1 offers the same instance types.
- Customers accept a 30-minute maintenance window on a Saturday night.

## Reversibility
- Reversible: S1 to S20
- Irreversible: S21

=====KEY=====
A1 | architect | S3 | Customers are told the new egress addresses on the Thursday before a Saturday cutover, but their contracts need 10 business days' notice; webhooks from the new addresses will be blocked by their allowlists. The notice must go out at least two weeks earlier (or the old addresses be kept).
A2 | architect | S15 | The replica is promoted (S15) before the workers in eu-west-1 are stopped (S16); the maintenance page only stops API traffic, so workers keep writing to the old primary after promotion and those writes are lost. Stop all writers before promoting.
A3 | architect | S8 | Scaling Deployments to 0 does not stop CronJobs: the manifests deployed to the new cluster include the CronJobs (such as 23:00 invoicing), which will run in the new cluster before cutover or in both clusters around it. No step suspends them in either cluster.
K1 | skeptic | S9 | Redis is not only a cache: the context says it is the durable job queue for the workers. Starting with an empty Redis drops every queued job at cutover.
K2 | skeptic | S20 | The rollback points traffic back at the old primary, which has none of the writes accepted in eu-central-1 after promotion (and may have diverged); rolling back loses data, and S21 deletes the old side at 23:30 anyway, inside the one-hour rollback window.
K3 | skeptic | S10 | Production secrets are exported to a YAML file and attached to a ticket for the whole team: secrets in plain text in a ticketing system.
P1 | pragmatist | S5 | A custom Go copy program with a DynamoDB progress table reinvents S3 cross-region replication (or batch replication / a sync tool).
P2 | pragmatist | S7 | Replacing kustomize with a new Helm pipeline in the middle of a region move is a separate project and adds risk; the existing deploy tooling can target the new cluster.
P3 | pragmatist | S11 | Writing a backup operator reinvents Velero, which the team already uses for cluster backups.
V1 | verifier | S6 | The "about 2 hours" figure is wrong on its own numbers: 1 Gbit/s is at most about 450 GB an hour, so 4 TB takes roughly 9 hours or more; a copy started at 19:00 cannot finish before 22:00. No trial measured it.
V2 | verifier | S14 | `pg_is_in_recovery()` is true for any replica whatever its lag; the check cannot fail and says nothing about whether the replica has caught up. It should measure replay lag against the stopped primary.
V3 | verifier | S19 | Alert rules select on region="eu-west-1" and no step changes them, so after the move no alert covers the service: a failure in eu-central-1 would not be noticed.
