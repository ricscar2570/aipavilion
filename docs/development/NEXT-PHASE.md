# Phase 5: deployed pilot validation and release evidence

Phase 4 supplies the code and infrastructure required for a controlled staging environment. Phase 5 must produce external evidence that the system works safely under real AWS, Stripe test mode, SES, browser and operational conditions.

## P0 deployed verification

1. Deploy all three staging stacks in an isolated AWS account using GitHub OIDC.
2. Apply and verify every schema migration from a clean retained environment.
3. Run DynamoDB integration, API smoke and Playwright multi-role journeys.
4. Verify CloudFront headers, cache behavior, SPA fallback and exact-origin CORS.
5. Verify WAF managed rules, rate limiting and Turnstile failure/recovery paths.
6. Exercise Stripe subscription checkout, portal, delayed/duplicate/failed webhooks and reconciliation in test mode.
7. Send invitations to real test recipients and verify delivery, bounce, complaint, resend and revoke states.
8. Trigger every CloudWatch alarm and confirm notification ownership and runbook links.
9. Execute a point-in-time recovery and record achieved RPO/RTO.
10. Run load and soak tests against agreed pilot volumes and cost budgets.

## P0 independent assurance

- independent penetration test and explicit cross-tenant authorization review;
- dependency, SAST, secret and infrastructure findings triaged to closure;
- manual WCAG 2.2 AA review using keyboard and screen readers;
- privacy/legal review of leads, invitations, analytics, audit, billing and subprocessors;
- deletion, export and retention exercises using realistic test identities;
- removal of CSP `style-src 'unsafe-inline'` after eliminating legacy inline styles.

## P0 pilot readiness

1. Define support ownership, escalation contacts and incident rota.
2. Create customer-facing onboarding, organizer and exhibitor guides.
3. Establish pilot terms, data-processing terms, privacy notice and support expectations.
4. Onboard two real pilot tenants without direct database edits.
5. Measure setup time, invitation delivery, publication success, lead delivery and support requests.
6. Close every P0/P1 defect and document accepted lower-severity risks.
7. Verify billing entitlement changes and cancellation behavior with a real pilot organizer in Stripe test mode.
8. Produce a signed release decision containing deployed evidence, residual risks and rollback plan.

## Exit criteria

Phase 5 is complete only when:

- staging is reproducibly deployed with no console-only configuration;
- all deployed automated journeys pass repeatedly;
- no known critical/high security or cross-tenant defect remains;
- independent security and accessibility reviews are complete;
- restore, incident and alarm exercises have measured evidence;
- two pilot tenants complete the end-to-end organizer/exhibitor workflow;
- legal/privacy and operational owners approve the pilot;
- customer support and rollback responsibilities are explicit.
