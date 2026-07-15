# ADR-002: organization-scoped multi-tenancy

- Status: accepted for Phase 3
- Date: 2026-07-14

## Context

The earlier prototype treated stands, leads and users as resources in one global application space. A sellable organizer/exhibitor product requires explicit customer ownership and demonstrable denial of cross-customer access.

## Decision

AI Pavilion uses organization-scoped application multi-tenancy.

- `organizationId` is the immutable tenant identifier.
- Events belong to exactly one organization.
- Stands belong to one organization and one event.
- Leads and interactions inherit organization and event ownership from the target stand.
- Access is granted through an active membership stored server-side.
- Supported membership roles are `owner`, `organizer` and `exhibitor`.
- Platform administration is separate from tenant membership.
- Exhibitor stand access additionally requires `ownerUserId` or an explicit assignment.
- Public APIs expose projections of published resources, never private tenant records.
- Authorization helpers load memberships and compare resource ownership in the backend.
- Negative tests use two complete tenant fixtures and attempt cross-tenant reads and mutations.

## Data layout

Phase 3 keeps separate DynamoDB tables for organizations, memberships, events, invitations, entitlements and audit events. Existing stand, lead and interaction items gain organization/event ownership fields and schema versions.

Access patterns use GSIs for organization members, organization events, public events, event stands, owner stands, organization leads and organization audit events. Public catalogue handlers use queries rather than full-table scans.

## Consequences

Positive:

- tenant isolation is explicit and testable;
- organizer and exhibitor workflows can be developed independently;
- public projections can evolve without exposing private records;
- plan limits and audit trails have a stable tenant boundary.

Costs:

- every protected handler must resolve identity and membership;
- data migrations must populate ownership fields before production rollout;
- denormalized ownership fields require consistency checks;
- production authorization requires independent review and continuous negative testing.

## Rejected alternatives

- Cognito groups as tenant membership: groups are global and do not model membership in multiple organizations.
- trusting tenant IDs or roles sent by the frontend: this is not an authorization control.
- one AWS account or table per customer for the pilot: operationally disproportionate for the current scale.
