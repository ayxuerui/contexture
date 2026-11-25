# Plan: Move company email from our own mail server to the hosted provider Northmail

## Context
35 people. Mail runs on a Postfix and Dovecot server we operate at 203.0.113.10. DNS for example.com is on
Cloudflare. The MX record has a TTL of 86400 seconds. SPF is `v=spf1 ip4:203.0.113.10 -all` and outgoing mail
is DKIM-signed by the old server. Mailboxes total 400 GB.

## Steps
S1. Create the 35 mailboxes in Northmail from the HR list.
S2. On Friday at 18:00, change the MX records to point at Northmail.
S3. Lower the MX TTL to 300 seconds so the change spreads quickly.
S4. Write a Python script that logs in to both servers over IMAP, walks every folder and message, and copies each mailbox across, keeping a state file so it can resume.
S5. Collect each person's mail password in a Google Sheet the IT group can open, and run the script for all mailboxes over the weekend. The copy will take about 6 hours in total.
S6. While we are changing DNS, move the whole example.com zone from Cloudflare to Route 53 and put every record under Terraform.
S7. Send everyone a setup guide for Northmail on Monday morning.
S8. Verify the migration: send a test message from one Northmail mailbox to another and confirm it arrives.
S9. On Monday at 09:00, shut down the old mail server and wipe its disks to stop paying for it.

## Assumptions
- Northmail accepts mail for example.com as soon as the mailboxes exist.
- People can live without old mail for part of the weekend.

## Reversibility
- Reversible: S1 to S8
- Irreversible: S9

=====KEY=====
A1 | architect | S3 | The TTL is lowered after the MX change; resolvers still hold the old record for up to a day. The TTL must be lowered at least 24 hours before the cutover.
A2 | architect | S2 | No step updates SPF or publishes DKIM (or DMARC) for Northmail, so mail sent from Northmail fails authentication against the existing `ip4:203.0.113.10 -all` record.
K1 | skeptic | S5 | Every person's mail password is collected in a spreadsheet a group can open: credentials stored in plain text in a document.
K2 | skeptic | S9 | The old server is wiped on Monday morning while mail can still be arriving there and before the copy is confirmed complete; a wipe cannot be undone and loses that mail.
P1 | pragmatist | S4 | A hand-written IMAP copy script reinvents imapsync or the provider's own migration tool.
P2 | pragmatist | S6 | Moving the DNS zone to Route 53 and into Terraform is unrelated to moving mail and adds risk to the same weekend.
V1 | verifier | S8 | A message between two Northmail mailboxes never leaves Northmail, so it does not test the MX change, outside senders, or outgoing authentication; the check passes even if the migration is broken.
V2 | verifier | S5 | The "about 6 hours" estimate for copying 400 GB has no measurement behind it (no trial on one mailbox), and the weekend schedule depends on it.
