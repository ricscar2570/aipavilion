# Incident response for the controlled pilot

## Severity

| Severity | Example                                                                           | Initial objective                                   |
| -------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| SEV-1    | cross-tenant exposure, payment integrity failure, widespread outage               | contain immediately and suspend affected capability |
| SEV-2    | one tenant unable to operate, invitation delivery outage, persistent elevated 5xx | restore or provide a safe workaround                |
| SEV-3    | degraded non-critical feature or isolated defect                                  | schedule and communicate correction                 |

The times above are operational objectives, not a contractual SLA.

## First response

1. Record UTC start time, reporter, affected environment and request IDs.
2. Stop further damage: disable a route, suspend a tenant, revoke a key or roll back the release.
3. Preserve logs and provider event IDs before changing resources.
4. Determine whether personal data, authorization or payment integrity is involved.
5. Assign one incident lead and one communication owner.

## Containment examples

- Cross-tenant suspicion: disable the affected API route and preserve audit records.
- Stripe mismatch: stop new billing sessions; reconcile subscriptions from Stripe test/live source of truth.
- SES complaint spike: stop resends and inspect recipient consent and list quality.
- Bot flood: lower WAF rate limits or add a temporary scoped block rule.
- Bad release: deploy the last compatible release through CloudFormation; never patch Lambda code in the console.

## Evidence

Collect only what is necessary:

- CloudWatch request and error logs;
- API Gateway request ID and Lambda request ID;
- WAF sampled request metadata;
- CloudFormation stack events;
- Stripe event IDs, not card data;
- SES message IDs and event types;
- affected tenant/resource IDs.

Do not include access tokens, secret keys, full lead messages or unredacted exports in ordinary tickets.

## Closure

An incident closes only after containment, restoration, customer communication where applicable, root-cause analysis, corrective tests and backlog ownership. Record whether privacy or legal notification assessment was required.
