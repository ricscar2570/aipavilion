# Active API surface

[`../api/openapi.json`](../api/openapi.json) and `template.yaml` are authoritative. `npm run check:contracts` validates infrastructure routes and authorizers; `npm run check:openapi` validates route parity, operation IDs, parameters and request/response contracts.

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

| Method   | Route                          |
| -------- | ------------------------------ |
| POST     | `/checkout/create-intent`      |
| POST     | `/checkout/confirm-order`      |
| GET      | `/checkout/order/{orderId}`    |
| GET      | `/user/orders`                 |
| GET      | `/user/stats`                  |
| GET/POST | `/user/saved-stands`           |
| DELETE   | `/user/saved-stands/{standId}` |
| GET      | `/user/export`                 |
| DELETE   | `/user/account`                |

API Gateway applies the Cognito authorizer. Clients send an access token. Order, saved-resource, export and deletion APIs enforce ownership.

## Organization, team and billing routes

| Method       | Route                                                  | Authorization                                  |
| ------------ | ------------------------------------------------------ | ---------------------------------------------- |
| GET          | `/me/memberships`                                      | authenticated actor                            |
| POST         | `/platform/organizations`                              | platform admin                                 |
| GET/PATCH    | `/organizations/{organizationId}`                      | member read; owner/organizer onboarding update |
| GET/POST     | `/organizations/{organizationId}/memberships`          | owner/organizer                                |
| PATCH/DELETE | `/organizations/{organizationId}/memberships/{userId}` | owner/organizer with owner safeguards          |
| GET          | `/organizations/{organizationId}/entitlement`          | owner/organizer                                |
| GET          | `/organizations/{organizationId}/billing`              | owner                                          |
| POST         | `/organizations/{organizationId}/billing/checkout`     | owner                                          |
| POST         | `/organizations/{organizationId}/billing/portal`       | owner                                          |
| GET          | `/organizations/{organizationId}/audit`                | owner/organizer                                |

Billing plans, Stripe Price IDs and entitlements are server-owned. Webhook state transitions are deduplicated and failed processing can be retried.

## Event, invitation and moderation routes

| Method         | Route                                                                                | Authorization                          |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| GET/POST       | `/organizations/{organizationId}/events`                                             | member read; owner/organizer create    |
| GET/PUT/DELETE | `/organizations/{organizationId}/events/{eventId}`                                   | tenant lifecycle rules                 |
| POST           | `/organizations/{organizationId}/events/{eventId}/publish`                           | owner/organizer                        |
| POST           | `/organizations/{organizationId}/events/{eventId}/duplicate`                         | owner/organizer                        |
| POST           | `/organizations/{organizationId}/events/{eventId}/archive`                           | owner/organizer                        |
| GET            | `/organizations/{organizationId}/events/{eventId}/stands`                            | owner/organizer                        |
| PATCH          | `/organizations/{organizationId}/events/{eventId}/stands/{standId}/moderation`       | owner/organizer                        |
| GET/POST       | `/organizations/{organizationId}/events/{eventId}/invitations`                       | owner/organizer and entitlement limits |
| POST           | `/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}/resend` | owner/organizer                        |
| DELETE         | `/organizations/{organizationId}/events/{eventId}/invitations/{invitationId}`        | owner/organizer                        |

## Invitation and exhibitor routes

| Method  | Route                                | Authorization                         |
| ------- | ------------------------------------ | ------------------------------------- |
| POST    | `/invitations/{invitationId}/accept` | authenticated invited email recipient |
| GET     | `/exhibitor/stands`                  | authenticated exhibitor               |
| GET/PUT | `/exhibitor/stands/{standId}`        | assigned owner only                   |
| POST    | `/exhibitor/stands/{standId}/submit` | assigned owner only                   |
| GET     | `/exhibitor/leads`                   | assigned stands only                  |
| GET     | `/exhibitor/leads/export`            | assigned stands only and entitlement  |
| PATCH   | `/exhibitor/leads/{leadId}`          | target stand owner only               |

## Platform administrator routes

| Method         | Route                     |
| -------------- | ------------------------- |
| GET            | `/admin/dashboard`        |
| GET/POST       | `/admin/stands`           |
| GET/PUT/DELETE | `/admin/stands/{standId}` |
| GET            | `/admin/users`            |
| GET            | `/admin/orders`           |
| GET            | `/admin/analytics`        |

The admin handler independently verifies the access-token signature and `admin` Cognito group.

## Identity and tenant boundary

The browser does not call custom password-handling Lambda routes. Cognito authenticates the user. Protected handlers derive `sub` and email from the verified authorizer context, then load active membership or resource ownership from DynamoDB. Request-body tenant roles are ignored as authorization evidence.
