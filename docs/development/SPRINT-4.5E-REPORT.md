# Sprint 4.5E report — public catalogue and product-scope hardening

Version: 0.8.5

## Objective

Make the visitor-facing product safe by default: publication must be explicit, contact data must be opt-in, pilot search must not silently miss later DynamoDB pages, and controls for features that do not exist must not be shown.

## Implemented

- Public stands now require the exact state `published`, approved moderation, public visibility, a published event snapshot, a published public status and a coherent `published#` index key.
- Public events now require explicit public status and a publication timestamp.
- The public projection no longer returns raw email, phone or website fields. Each field is exposed only when the exhibitor enables the corresponding `publicContact` flag.
- Hidden products are excluded from public stand responses and search text.
- Search continues through DynamoDB GSI pages until it obtains the requested result count or reaches the end. Product names and descriptions are searchable.
- Event publication synchronizes the visibility snapshot of its stands, making retries deterministic.
- A versioned migration adds moderation/contact defaults and repairs missing publication timestamps without broadly publishing ambiguous records.
- The exhibitor portal includes explicit public-contact consent controls.
- Placeholder images are local and image failures are handled by delegated JavaScript rather than inline handlers.
- Booking, language, recommendation and notification controls without working product flows were removed.
- Inline event handlers, inline style attributes and JavaScript style mutations were removed from the active frontend; the pilot CSP no longer permits `unsafe-inline`.
- Search and related cards now support keyboard activation and route to the canonical stand URL.

## Verification boundary

Source syntax, JSON, migration structure, OpenAPI shape, frontend policy and Sprint-specific static contracts can be verified without network access. Full Jest, lint, Vite, npm audit, SAM and deployed-browser evidence still require the public npm registry and an equipped AWS staging environment.

## Remaining work

Sprint 4.5F must complete manual WCAG 2.2 AA verification, session-expiry/error behavior, privacy/legal review and browser evidence under the stricter CSP. Sprint 4.5G must produce load, restore, WAF, delayed-webhook and independent security evidence.
