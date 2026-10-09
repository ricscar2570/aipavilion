# AI Pavilion 0.8.6-legacy.1

This prerelease completes the source implementation of LEGACY-01 and closes the Core Correctness source blocks scheduled for 0.8.6.

## Included

- machine-readable inventory of every discovered mutation-capable source;
- CI gate that rejects undeclared writers;
- read-only platform-admin stand API and IAM policy;
- removal of the legacy global stand create/update/delete semantics;
- canonical stand domain helper and fixture validation;
- dependency-free LEGACY-01 self-test including runtime rejection of an admin mutation;
- production guard for synthetic writers;
- plan-only migration and repair boundary;
- canonical, revisioned development and sample fixtures;
- repaired event and exhibitor-stand concurrency regressions inherited from the previous prerelease;
- regenerated pilot backend template and synchronized OpenAPI/documentation.

## Release boundary

AUTH-01, QUOTA-01, INVITE-01, CONCURRENCY-01, EXPORT-01 and LEGACY-01 are source-complete. This is still a pre-production release. AWS Cognito, DynamoDB concurrency, IAM, migration, tenant-isolation, browser, accessibility, privacy, restore and security evidence remain mandatory under 4.5F/4.5G before a customer pilot.
