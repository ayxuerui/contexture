# Plan: Put all six internal tools behind Okta single sign-on and enforce MFA by 1 December

## Context
The six tools are the wiki, the CI server, Grafana, the admin console, the VPN portal and the billing back
office. There are 220 employees with Okta accounts and 30 contractors who use their own companies' email
addresses and have no Okta account. Four automation scripts log in to the admin console with service accounts
over basic authentication. The on-call engineer depends on Grafana during incidents. Okta had two outages last
year, 3 hours in total. Five tools support SAML and SCIM natively; the billing back office is legacy and only
supports LDAP. Our Okta licence includes Okta's LDAP Interface. The audit requirement is that every tool
enforces MFA by 1 December.

## Steps
S1. Create an Okta application for each of the six tools.
S2. For the billing back office, write an in-house bridge service that accepts SAML assertions and answers LDAP binds.
S3. Write a nightly script that reads the HR export and sets each person's role in each tool through that tool's API.
S4. Keep the SAML signing key and an Okta API token on the rollout's wiki page so that everyone working on the rollout can test.
S5. Build an internal access portal: a page with a tile for each tool that starts the sign-in.
S6. Turn on SSO in each tool as an optional sign-in method for one week.
S7. Verify SSO on each tool by signing in as the Okta super administrator.
S8. Set the Okta MFA policy to optional enrolment so that nobody is blocked on the day of the switch.
S9. On Monday at 09:00, disable password sign-in on all six tools at once. From then on everyone signs in with their corporate Okta account.
S10. In the week after the switch, send the enrolment instructions and hold help sessions.
S11. Measure success: in the week after the switch, 100% of sign-ins in the tools' logs go through SSO.
S12. Report to audit that the requirement is met. Okta's 99.99% uptime means an identity-provider outage is not a risk we need to plan for.

## Assumptions
- Only people sign in to the tools.
- Role names in the HR export match the roles in each tool.

## Reversibility
- Reversible: S1 to S12
- Irreversible: none

=====KEY=====
A1 | architect | S9 | The 30 contractors have no Okta account, and from S9 everyone must sign in with a corporate Okta account; no step creates accounts or another route for them, so they are locked out.
A2 | architect | S8 | The goal is that MFA is enforced by 1 December, but the policy is set to optional enrolment and no later step makes it required; the plan does not achieve its stated goal.
A3 | architect | S10 | Enrolment instructions and help sessions come the week after password sign-in is disabled (S9); people need them before the switch.
K1 | skeptic | S9 | All six tools, including Grafana and the VPN portal, lose password sign-in at once with no break-glass account; during an Okta outage (two last year) the on-call engineer cannot reach Grafana, and a misconfiguration locks everyone out of everything together.
K2 | skeptic | S9 | Four automation scripts sign in to the admin console with service accounts over basic authentication; disabling password sign-in breaks them. The assumption that only people sign in is false.
K3 | skeptic | S4 | The SAML signing key and an Okta API token are kept on a wiki page: anyone who can read the page can forge sign-ins to every tool.
P1 | pragmatist | S2 | An in-house SAML-to-LDAP bridge reinvents Okta's LDAP Interface, which the licence already includes.
P2 | pragmatist | S3 | A nightly role-sync script against each tool's API reinvents SCIM provisioning, which five of the tools support natively.
P3 | pragmatist | S5 | A custom access portal with tiles duplicates the Okta dashboard every user already gets.
V1 | verifier | S7 | Signing in as the Okta super administrator does not test what ordinary users get: role mapping, group assignment and denial for people who should have no access are untested, so the check passes with mappings broken.
V2 | verifier | S11 | Once password sign-in is disabled, every sign-in is through SSO by construction; "100% through SSO" cannot fail and does not show that people can sign in or that MFA was used.
V3 | verifier | S12 | The 99.99% uptime figure has no source and is contradicted by the context: 3 hours of outage in a year is about 99.97%, more than three times the downtime 99.99% allows.
