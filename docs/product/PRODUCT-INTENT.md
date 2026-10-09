# AI Pavilion: original intent, current product and target product

## Original intent

The first repository described AI Pavilion as an immersive enterprise virtual-expo platform. Its intended experience combined:

- digital pavilions and exhibitor stands;
- searchable product catalogues;
- augmented-reality product previews;
- navigable 360-degree tours;
- visitor accounts, wishlists and reviews;
- direct product checkout;
- exhibitor and platform analytics;
- event administration and email notifications.

The original material treated these capabilities as one product and sometimes presented them as already complete. The source code did not support that level of maturity. In particular, AR, 360-degree presentation, marketplace settlement and advanced analytics were demonstrations or disconnected modules rather than a deployable commercial system. The name “AI Pavilion” also did not correspond to a production AI capability.

## What version 0.8.6-auth.1 actually does

AI Pavilion is now a serverless B2B SaaS foundation for virtual and hybrid events.

An organizer can operate an isolated organization, create and publish events, invite exhibitors, review stands, manage team membership, inspect audit events, export personal data and manage a SaaS subscription.

An exhibitor can accept an invitation, edit only assigned stands, submit them for review and manage leads belonging to those stands.

A visitor can browse explicitly published events and approved public stands, search the complete pilot-scale public catalogue, save stands and contact exhibitors through a protected form. Direct email, phone and website details appear only when the exhibitor opts in to each field. Public resources are separated from tenant administration.

The code includes infrastructure for Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, WAF, SES, Stripe subscription billing, CloudWatch, AWS Backup and budgets. These integrations are prepared for staging but are not considered proven until the public CI and AWS evidence workflow completes successfully.

Direct visitor product checkout remains in the code for controlled development verification, but it is disabled by default in persistent staging. The pilot product is lead-generation software, not a multi-vendor marketplace.

Version `0.8.6-auth.1` also establishes an explicit scoped Cognito access-token boundary. API Gateway requires a coarse user, tenant or platform-admin scope, while current membership, role, ownership, assignment and entitlement remain server-side decisions. This is an authentication hardening prerelease, not completion of the wider Core Correctness sprint.

The current product does not yet provide a commercial AR experience, a complete 360-degree showroom, an AI recommendation system, streaming, matchmaking or marketplace payouts.

## Target product for the first commercial release

The recommended first commercial release is a B2B platform through which event organizers can:

1. buy an event plan or subscription;
2. configure a branded virtual or hybrid event;
3. invite and manage exhibitors;
4. publish moderated exhibitor stands;
5. allow visitors to discover exhibitors and products;
6. collect, route and export qualified leads;
7. measure engagement by event, stand and period;
8. operate the service with audit, backup, monitoring, privacy and support controls.

The product should be usable without AR, 360-degree tours or marketplace settlement. Those capabilities should be added only after the core platform has demonstrated customer demand and repeatable commercial value.

## Long-term vision

After the core SaaS is stable, the original immersive vision can return as modular extensions:

- 360-degree stand templates;
- AR previews for supported product categories;
- meeting booking and live sessions;
- exhibitor recommendations and semantic discovery;
- multilingual content assistance;
- visitor networking;
- multi-vendor commerce through a dedicated marketplace architecture such as connected seller accounts, payouts, refunds and reconciliation.

AI should not be added merely to justify the product name. A future AI feature must have a measurable purpose, such as helping exhibitors create stand content, improving semantic search, recommending relevant stands or summarizing event analytics, with privacy, explainability and human control.

## Product principle

The commercial sequence is:

> reliable events and lead generation first; immersion and marketplace capabilities only after the core product is proven.
