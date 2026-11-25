# Plan: Replace the checkout pricing library `pricing-v1` with `pricing-v2`

## Context
An online shop with about 20,000 orders a day. `pricing-v2` rounds tax per line item; `pricing-v1` rounds once
per order, so totals can differ by a few cents. The mobile app shows the cart total using its own bundled copy
of `pricing-v1`. Refunds are computed by re-running the current pricing library over the order's line items.
The company already uses Unleash for feature flags in other services.

## Steps
S1. Implement `pricing-v2` in the checkout service behind a flag named `pricing_v2`.
S2. Build a flag system for the checkout service: a flags table, an admin page, and a client with percentage rollouts.
S3. Add snapshot tests for `pricing-v2`: record its output for 500 sample carts and assert that later runs produce the same output.
S4. Turn the flag on for all traffic on the morning of Black Friday, to collect the most data in the shortest time.
S5. Run `pricing-v1` and `pricing-v2` side by side in shadow mode for a week and compare their totals.
S6. Rewrite the discount rules as a small rule language so that marketing can write discounts without engineers.
S7. Remove `pricing-v1` from the checkout service.
S8. After launch, finance will pick up any discrepancy between charged and expected totals in the month-end reconciliation.

## Assumptions
- Orders placed under `pricing-v1` need no special handling.
- A difference of a few cents per order is acceptable to customers.

## Reversibility
- Reversible: S1 to S6
- Irreversible: S7

=====KEY=====
A1 | architect | S5 | The week of shadow comparison (S5) comes after the flag is on for all traffic (S4); the comparison is what should inform the rollout and must come first.
A2 | architect | S1 | No step updates the mobile app, which computes the displayed cart total with its bundled pricing-v1; after the switch customers are shown one total and charged another.
K1 | skeptic | S4 | Turning the flag on for 100% of traffic at once on Black Friday morning puts an unproven pricing change on the highest-volume day with no gradual ramp, so any error hits every order.
K2 | skeptic | S7 | Refunds re-run the current library over line items, so orders placed under v1 will be refunded at v2 amounts that differ from what was charged; the assumption that old orders need no handling is false.
P1 | pragmatist | S2 | Building a flags table, admin page and rollout client reinvents Unleash, which the company already runs.
P2 | pragmatist | S6 | Rewriting discount rules as a rule language for marketing is a separate project the pricing replacement does not need.
V1 | verifier | S3 | Snapshot tests recorded from pricing-v2's own output only show it has not changed; they cannot show the output is correct, so they pass even if v2 computes wrong totals.
V2 | verifier | S8 | Relying on month-end reconciliation means a pricing error is noticed weeks late, after hundreds of thousands of orders; there is no monitoring or alert on v1/v2 or charged/expected differences at launch.
