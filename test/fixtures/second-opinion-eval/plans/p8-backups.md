# Plan: Nightly backups for the code-hosting server, losing at most 24 hours and restoring within 4

## Context
One VM runs Gitea (repositories on disk under `/var/lib/gitea`, metadata in a local Postgres) and the team
wiki (files and a SQLite database under `/srv/wiki`). There are no backups today. The VM has a second disk
mounted at `/mnt/backup`. The goal is to lose at most 24 hours of work and to be back within 4 hours.

## Steps
S1. Write `backup.sh`: create a tar archive of `/var/lib/gitea`, then run `pg_dump` of the Gitea database, and write both to `/mnt/backup/<date>/`.
S2. Schedule it with cron at 02:00 from Monday to Friday. Gitea stays running; the tar takes about 20 minutes and the dump starts when it ends.
S3. The script ends with `echo "BACKUP OK"`, and cron mails its output to the admin list; the daily mail is how we know the backup worked.
S4. Write a retention daemon in Go that implements grandfather-father-son rotation, driven by its own configuration language, to prune `/mnt/backup`.
S5. Package the backup script as a Helm chart and a Terraform module so other teams can reuse it.
S6. Record in the runbook that a restore takes under an hour.
S7. Close the "no backups" risk in the risk register.

## Assumptions
- The second disk has room for 30 days of archives.
- Admins read the daily mail.

## Reversibility
- Reversible: S1 to S7
- Irreversible: none

=====KEY=====
A1 | architect | S1 | The wiki under /srv/wiki (files and SQLite database) is on the same server and is not backed up by any step; the plan covers only Gitea.
A2 | architect | S2 | Running Monday to Friday leaves no backup on Saturday and Sunday nights, so up to about 72 hours can be lost, against the stated 24-hour limit.
K1 | skeptic | S1 | Backups are written to a second disk on the same VM, with no copy elsewhere; losing the VM, its host or its account (or ransomware, or an admin mistake) loses the data and the backups together.
K2 | skeptic | S2 | The repositories are archived while Gitea is running and the database is dumped about 20 minutes later, so the two halves are from different moments (and the tar itself can catch repositories mid-write): a restore can be inconsistent.
P1 | pragmatist | S4 | A custom retention daemon with its own configuration language reinvents what restic or borg `forget`, or a one-line find/cron, already does.
P2 | pragmatist | S5 | A Helm chart and Terraform module for a script that runs on one VM is reuse nobody has asked for.
V1 | verifier | S3 | The script prints "BACKUP OK" unconditionally, whatever tar and pg_dump returned, so the daily mail says OK even when the backup failed; and a missing mail is not noticed.
V2 | verifier | S6 | No restore is ever performed: "under an hour" and the 4-hour target are unmeasured claims, and the backups are never shown to be restorable.
