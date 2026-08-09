# Next phase: Sprint 4.5F–4.5G assurance and pilot evidence

Sprints 4.5A–4.5E have repaired repository portability, staging bootstrap, account lifecycle, transactional consistency and the public catalogue boundary. No new immersive, AI or marketplace features should be added until the external evidence gates are complete.

## 4.5B — External execution still open

GitHub-hosted CI and an isolated AWS account must still produce retained proof of public `npm ci`, full verification, SAM validation/build, three-stack deployment, DynamoDB/API/browser/synthetic success and a hashed evidence manifest.

## 4.5E — Completed in 0.8.5

Public events and stands are fail closed, contact details are opt-in, pilot search traverses DynamoDB pages, hidden products are excluded, event publication synchronizes stand visibility, migration `002` upgrades existing records, incomplete controls are removed and the active frontend no longer requires inline CSP allowances.

## 4.5F — Frontend, accessibility and privacy completion

1. Run the full browser journey under the strict production CSP.
2. Complete keyboard, focus, validation, network-error and session-expiry behavior.
3. Run manual WCAG 2.2 AA checks with screen readers and mobile zoom/reflow.
4. Complete privacy, retention, processor and customer-terms review.
5. Resolve every P0/P1 usability, accessibility and privacy finding.

## 4.5G — Operational and independent evidence

1. Run load, throttling, retry and concurrency tests.
2. Complete restore and incident drills with measured RPO/RTO.
3. Verify alarms, WAF, SES and delayed Stripe webhooks in staging.
4. Complete an independent penetration and tenant-isolation assessment.
5. Close all critical/high findings before customer data enters the system.

## Pilot exit criteria

Pilot release is permitted only when public CI and SAM builds are reproducibly green, staging requires no console edits, deployed journeys pass repeatedly, strict-CSP and accessibility evidence is approved, consistency guarantees are demonstrated, restore/privacy/security evidence is signed off and support/rollback/customer terms are explicit.
