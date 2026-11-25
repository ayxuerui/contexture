# Plan: Rotate the webhook signing secret shared with our 14 partner integrations

## Context
The secret `wh_sign_v1` appeared in a support screenshot three days ago. We sign every outgoing webhook with
it (HMAC-SHA256) and each partner verifies the signature with their own copy, set in their dashboard. Two of
our services sign webhooks: `billing-api` sends the first attempt and `billing-retry-worker` sends retries.
Both read the secret from Vault at deploy time.

## Steps
S1. Generate a new 32-byte random secret and store it at the Vault path `billing/wh_sign_v2`.
S2. Post the new secret in the #partners-eng Slack Connect channel, which all 14 partners are in, so each can pick it up.
S3. Deploy `billing-api` reading `billing/wh_sign_v2`, so that all webhooks are signed with the new secret.
S4. Partners replace the verification secret in their dashboard when they see the Slack message.
S5. Build a small web dashboard (a React page and a new Postgres table) that shows which of the 14 partners have switched.
S6. For one week, log the signature header and the secret used for every delivery at INFO level, to help partners debug mismatches.
S7. Build a secret-rotation service with a plugin interface for other credential types (API keys, database passwords, TLS certificates), and move this rotation into it for next time.
S8. Verify the rotation: send a test webhook to our own echo endpoint and confirm it answers 200.
S9. Remove `billing/wh_sign_v1` from Vault.
S10. Declare the rotation complete once every partner has been notified.

## Assumptions
- Partners read the Slack channel within a working day.
- Vault access is limited to the billing team.

## Reversibility
- Reversible: S1 to S8
- Irreversible: S9

=====KEY=====
A1 | architect | S3 | Signing switches to the new secret (S3) before partners have installed it (S4), so every webhook fails verification in between; there is no overlap window in which both secrets are accepted or sent.
A2 | architect | S3 | Only billing-api is redeployed; billing-retry-worker also signs webhooks and no step moves it to the new secret, so retries keep using the leaked one (and break once v1 is removed).
K1 | skeptic | S2 | The new secret is posted in a Slack channel shared with 14 outside companies, exposing it to everyone in that channel and its history: the leak the rotation is meant to fix, repeated.
K2 | skeptic | S6 | Logging the secret itself at INFO level for a week puts the signing secret into logs.
P1 | pragmatist | S5 | A React dashboard and a new table to track 14 partners is more than the job needs; a checklist or spreadsheet does it.
P2 | pragmatist | S7 | A general secret-rotation service with plugins for other credential types is built for a future need, not this rotation.
V1 | verifier | S8 | A 200 from our own echo endpoint proves nothing: the echo endpoint does not verify the signature, so the check passes whichever secret signed the webhook.
V2 | verifier | S10 | Completion is defined as partners having been notified, not as each partner verifying successfully with the new secret; nothing checks per-partner delivery success.
