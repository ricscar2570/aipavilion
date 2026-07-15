# Privacy data inventory

This is an engineering inventory, not legal advice or a completed data-protection assessment.

| Domain              | Representative data                                    | Purpose                                     | Default technical retention                                    |
| ------------------- | ------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- |
| Cognito account     | email, name attributes, authentication metadata        | account access                              | until account deletion, subject to provider logs               |
| Application profile | user ID, email, locale, timestamps                     | product profile and support                 | until account deletion                                         |
| Membership          | user ID, organization, role, status                    | tenant authorization                        | organization lifecycle plus approved audit needs               |
| Invitation          | recipient email, stand name, delivery state            | exhibitor onboarding                        | TTL plus operational/audit period                              |
| Lead                | name, email, message, consent timestamp                | answer visitor request                      | one year TTL in current code, to be confirmed legally          |
| Order               | user ID, items, amount, state                          | checkout and reconciliation                 | business/legal retention to be defined by market               |
| Billing entitlement | plan, limits, Stripe identifiers server-side           | SaaS access control                         | subscription lifecycle plus reconciliation period              |
| Interaction         | pseudonymous identifiers, stand/event action           | product analytics and abuse investigation   | policy to be approved before production                        |
| Audit event         | actor ID, action, resource, request ID                 | security and accountability                 | configurable, 730 days in staging deployment                   |
| Cloud/edge logs     | IP-derived provider metadata, request path, request ID | security, reliability and incident response | CloudFront logs 90 days; Lambda logs 90 days in pilot template |

## Implemented controls

- tenant authorization is resolved server-side;
- public responses omit ownership, payment and idempotency internals;
- personal data export is available at `GET /user/export`;
- account deletion exists and anonymizes retained orders;
- leads record explicit privacy acknowledgement time;
- audit data has DynamoDB TTL;
- secrets are stored in Secrets Manager, not frontend configuration;
- staging backups and retained resources are infrastructure managed.

## Required governance before production

- approve legal bases and controller/processor roles;
- approve per-domain retention and deletion exceptions;
- publish privacy and cookie notices;
- document processors and subprocessors;
- perform a data-transfer assessment where required;
- define data-subject request identity verification;
- define breach assessment and notification procedures;
- review whether interaction analytics require consent;
- review lead exports and organizer responsibilities;
- perform a DPIA if the final processing risk requires one.
