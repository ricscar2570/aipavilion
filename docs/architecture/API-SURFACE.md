# Active API surface

[`../api/openapi.json`](../api/openapi.json) and `template.yaml` are authoritative. `npm run check:auth` validates the scoped Cognito access-token boundary; `npm run check:contracts` validates infrastructure routes and handlers; `npm run check:openapi` validates route parity, operation IDs, parameters and request/response contracts.

## Cognito access-token scopes

API Gateway requires one coarse custom scope on every protected route:

| Scope                       | Route families                                                           | Meaning                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `aipavilion/user`           | `/user/*`, `/me/*`, invitation acceptance and protected product checkout | The token may call the signed-in user API family.                                                          |
| `aipavilion/tenant`         | `/organizations/*`, `/exhibitor/*`                                       | The token may call tenant API families; active membership and resource authorization are still mandatory.  |
| `aipavilion/platform-admin` | `/admin/*`, `/platform/*`                                                | The token may reach platform administration; the handler still verifies the `admin` Cognito group and JWT. |

Scopes are not tenant roles. They are issued by the Pre Token Generation V2.0 trigger and checked by API Gateway. Lambda handlers remain the source of truth for membership, role, ownership, assignment and entitlement.

## Public catalogue and event routes

| Method | Route                      | Purpose                                           |
| ------ | -------------------------- | ------------------------------------------------- |
| GET    | `/events`                  | List published public events                      |
| GET    | `/events/{eventId}`        | Read one published public event                   |
| GET    | `/events/{eventId}/stands` | List published stands in an event                 |
| GET    | `/stands`                  | List public published stands                      |
| GET    | `/stands/{standId}`        | Read one public stand                             |
| GET    | `/stands/search`           | Search public stands                              |
| POST   | `/stands/contact`          | Create or replay a consented, bot-checked lead    |
| POST   | `/interactions`            | Record a permitted non-economic interaction       |
| POST   | `/checkout/webhook`        | Receive the product-payment Stripe webhook        |
| POST   | `/billing/webhook`         | Receive the organizer-subscription Stripe webhook |

Public responses are projections and do not expose membership, owner, moderation, subscription or internal economic fields.

## Visitor account and checkout routes

| Method     | Route                          |
| ---------- | ------------------------------ |
| POST       | `/checkout/create-intent`      |
| POST       | `/checkout/confirm-order`      |
| GET        | `/checkout/order/{orderId}`    |
| GET        | `/user/orders`                 |
| GET        | `/user/stats`                  |
| GET/POST   | `/user/saved-stands`           |
| DELETE     | `/user/saved-stands/{standId}` |
| GET        | `/user/export`                 |
| GET/DELETE | `/user/account`                |

API Gateway applies the Cognito authorizer and requires `aipavilion/user`. Clients send an access token. Order, saved-resource, export and deletion APIs enforce ownership.

## Organization, team and billing routes

| Method       | Route                                                  | Authorization                                  |
| ------------ | ------------------------------------------------------ | ---------------------------------------------- |
| GET          | `/me/memberships`                                      | authenticated actor                            |
| POST         | `/platform/organizations`                              | platform admin                                 |
| GET/PATCH    | `/organizations/{organizationId}`                      | member read; owner/organizer onboarding update |
| POST         | `/organizations/{organizationId}/ownership-transfer`   | current owner; active organizer target         |
| GET/POST     | `/organizations/{organizationId}/memberships`          | owner/organizer                                |
| PATCH/DELETE | `/organizations/{organizationId}/memberships/{userId}` | owner/organizer with owner safeguards          |
| GET          | `/organizations/{organizationId}/entitlement`          | owner/organizer                                |
| GET          | `/organizations/{organizationId}/billing`              | owner                                          |
| POST         | `/organizations/{organizationId}/billing/checkout`     | owner                                          |
| POST         | `/organizations/{organizationId}/billing/portal`       | owner                                          |
| GET          | `/organizations/{organizationId}/audit`                | owner/organizer                                |

Billing plans, Stripe Price IDs and entitlements are server-owned. Webhook state transitions are deduplicated and failed processing can be retried.

## Event, invitation and moderation routes

| Method   | Route                                                                                | Authorization                          |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| GET/POST | `/organizations/{organizationId}/events`                                             | member read; owner/organizer create    |
| GET/PUT  | `/organizations/{organizationId}/events/{eventId}`                                   | tenant lifecycle rules                 |
| POST     | `/organizations/{organizationId}/events/{eventId}/publish`                           | owner/organizer                        |
| POST     | `/organizations/{organizationId}/events/{eventId}/duplicate`                         | owner/organizer                        |
| POST     | `/organizations/{organizationId}/events/{eventId}/archive`                           | owner/organizer                        |
| GET      | `/organizations/{organizationId}/events/{eventId}/stands`                            | owner/organizer                        |
| PATCH    | `/organizations/{organizationId}/events/{eventId}/stands/{standId}/assignment`       | owner/organizer; active member target  |
| PATCH    | `/organizations/{organizationId}/events/{eventId}/stands/{standId}/moderation`       | owner/organizer                        |
| GET/POST | `/organizations/{organizationId}/events/{eventId}/invitations`                       | owner/organizer and entitlement limits |
| POST     | `/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}/resend` | owner/organizer                        |
| DELETE   | `/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}`        | owner/organizer                        |

## Invitation and exhibitor routes

| Method  | Route                                | Authorization                                                              |
| ------- | ------------------------------------ | -------------------------------------------------------------------------- |
| POST    | `/invitations/{invitationId}/accept` | authenticated actor whose server-side profile email matches the invitation |
| GET     | `/exhibitor/stands`                  | authenticated exhibitor                                                    |
| GET/PUT | `/exhibitor/stands/{standId}`        | assigned owner only                                                        |
| POST    | `/exhibitor/stands/{standId}/submit` | assigned owner only                                                        |
| GET     | `/exhibitor/leads`                   | assigned stands only                                                       |
| GET     | `/exhibitor/leads/export`            | assigned stands only and entitlement                                       |
| PATCH   | `/exhibitor/leads/{leadId}`          | target stand owner only                                                    |

## Platform administrator routes

| Method | Route                     |
| ------ | ------------------------- |
| GET    | `/admin/dashboard`        |
| GET    | `/admin/stands`           |
| GET    | `/admin/stands/{standId}` |
| GET    | `/admin/users`            |
| GET    | `/admin/orders`           |
| GET    | `/admin/analytics`        |

The admin handler independently verifies the access-token signature and `admin` Cognito group. The platform-admin stand surface is deliberately read-only: canonical stand creation, editing, assignment, moderation and publication use tenant-scoped event and exhibitor workflows.

## Identity and tenant boundary

The browser does not call custom password-handling Lambda routes. Cognito authenticates the user. Protected handlers derive `sub` from the verified authorizer context and load current application state from DynamoDB. Email is a server-side profile attribute, not an authorization claim. Request-body tenant roles and coarse Cognito scopes are ignored as evidence of tenant membership.

## Account lifecycle

Cognito handles sign-up, confirmation, software-token MFA, temporary-password replacement, password recovery and password changes. `GET /user/account` reports deletion blockers. Organization ownership must be transferred and assigned stands must be reassigned before `DELETE /user/account` can succeed.
