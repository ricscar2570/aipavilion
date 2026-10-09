"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");

class Command {
    constructor(input) {
        this.input = input;
    }
}
class GetCommand extends Command {}
class QueryCommand extends Command {}
class UpdateCommand extends Command {}
class TransactWriteCommand extends Command {}

function updateEventFromValues(state, input) {
    const values = input.ExpressionAttributeValues || {};
    const expression = input.UpdateExpression || "";
    if (expression.includes(":publishing")) {
        state.event.status = "publishing";
        state.event.publicationState = "publishing";
        state.event.publicStatus = "hidden";
        state.event.publishOperationId = values[":operationId"];
        state.event.publishStartedAt ||= values[":now"];
        state.event.publishUpdatedAt = values[":now"];
        state.event.publishFailure = undefined;
    }
    if (expression.includes("publishCheckpoint = :checkpoint")) {
        state.event.publishCheckpoint = values[":checkpoint"];
        state.event.publishUpdatedAt = values[":now"];
    }
    if (expression.includes(":published")) {
        state.event.status = "published";
        state.event.publicationState = "published";
        state.event.publicStatus = values[":publicStatus"];
        state.event.publishedAt ||= values[":now"];
        state.event.publishUpdatedAt = values[":now"];
        state.event.publishCompletedAt = values[":now"];
        delete state.event.publishCheckpoint;
        delete state.event.publishFailure;
    }
    if (values[":nextRevision"] !== undefined) {
        state.event.revision = values[":nextRevision"];
    }
}

function loadEventsHandler(state) {
    const originalLoad = Module._load;
    const eventsPath = path.resolve("backend/lambda/events/index.js");
    delete require.cache[eventsPath];

    const fakeClient = {
        async send(command) {
            const input = command.input || {};
            if (command instanceof GetCommand) {
                if (input.TableName === "events-test") {
                    return { Item: { ...state.event } };
                }
                const stand = state.stands.find(
                    (item) => item.stand_id === input.Key?.stand_id,
                );
                return { Item: stand ? { ...stand } : undefined };
            }
            if (command instanceof QueryCommand) {
                const secondPage = Boolean(input.ExclusiveStartKey);
                return {
                    Items: secondPage
                        ? [{ ...state.stands[1] }]
                        : [{ ...state.stands[0] }],
                    LastEvaluatedKey: secondPage
                        ? undefined
                        : { stand_id: state.stands[0].stand_id },
                };
            }
            if (command instanceof UpdateCommand) {
                if (input.TableName === "events-test") {
                    updateEventFromValues(state, input);
                    return {};
                }
                if (input.TableName === "stands-test") {
                    const stand = state.stands.find(
                        (item) => item.stand_id === input.Key?.stand_id,
                    );
                    assert.ok(stand, "stand update must target a known stand");
                    const values = input.ExpressionAttributeValues || {};
                    stand.eventStatus = values[":eventStatus"];
                    stand.publicStatus = values[":publicStatus"];
                    stand.publicationKey = values[":publicationKey"];
                    stand.revision = values[":nextRevision"];
                    state.standUpdates += 1;
                    return {};
                }
            }
            if (command instanceof TransactWriteCommand) {
                const eventUpdate = (input.TransactItems || [])
                    .map((item) => item.Update)
                    .find((item) => item?.TableName === "events-test");
                if (eventUpdate) {
                    updateEventFromValues(state, eventUpdate);
                }
                return {};
            }
            throw new Error(`Unexpected command ${command.constructor.name}`);
        },
    };

    Module._load = function patched(request, parent, isMain) {
        if (request === "@aws-sdk/client-dynamodb") {
            return { DynamoDBClient: class DynamoDBClient {} };
        }
        if (request === "@aws-sdk/lib-dynamodb") {
            return {
                DynamoDBDocumentClient: { from: () => fakeClient },
                GetCommand,
                QueryCommand,
                UpdateCommand,
                TransactWriteCommand,
            };
        }
        if (request === "../common/tenant") {
            return {
                authorizeOrganization: async () => ({
                    ok: true,
                    actor: { userId: "user_owner", role: "owner" },
                }),
                getMembership: async () => null,
            };
        }
        if (request === "../common/audit") {
            return {
                buildAuditEvent: (value) => ({ auditId: "audit", ...value }),
                transactWithAudit: async (client, items) =>
                    client.send(
                        new TransactWriteCommand({ TransactItems: items }),
                    ),
            };
        }
        if (request === "./quota-wrapper") {
            return { wrap: (handler) => handler };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    process.env.EVENTS_TABLE = "events-test";
    process.env.STANDS_TABLE = "stands-test";
    process.env.MEMBERSHIPS_TABLE = "memberships-test";
    process.env.ENTITLEMENTS_TABLE = "entitlements-test";
    process.env.AUDIT_TABLE = "audit-test";
    process.env.EVENT_STANDS_INDEX = "event-stands-index";

    try {
        return {
            handler: require(eventsPath).handler,
            restore() {
                delete require.cache[eventsPath];
                Module._load = originalLoad;
            },
        };
    } catch (error) {
        Module._load = originalLoad;
        throw error;
    }
}

function publishRequest() {
    return {
        httpMethod: "POST",
        path: "/organizations/org_test/events/evt_test/publish",
        pathParameters: {
            organizationId: "org_test",
            eventId: "evt_test",
        },
        headers: { Origin: "http://localhost:3000" },
        requestContext: {
            requestId: "request-publish-saga",
            authorizer: { claims: { sub: "user_owner" } },
        },
    };
}

test("event publication is checkpointed and remains hidden until the final page", async () => {
    const state = {
        event: {
            eventId: "evt_test",
            organizationId: "org_test",
            name: "Test event",
            status: "draft",
            publicationState: "draft",
            publicStatus: "draft",
            visibility: "public",
            revision: 1,
        },
        stands: [
            {
                stand_id: "stand_1",
                eventId: "evt_test",
                organizationId: "org_test",
                status: "published",
                moderationStatus: "approved",
                visibility: "public",
                revision: 1,
            },
            {
                stand_id: "stand_2",
                eventId: "evt_test",
                organizationId: "org_test",
                status: "published",
                moderationStatus: "approved",
                visibility: "public",
                revision: 1,
            },
        ],
        standUpdates: 0,
    };
    const runtime = loadEventsHandler(state);
    try {
        const first = await runtime.handler(publishRequest(), {
            getRemainingTimeInMillis: () => 20_000,
        });
        assert.equal(first.statusCode, 202);
        assert.equal(state.event.status, "publishing");
        assert.equal(state.event.publicationState, "publishing");
        assert.equal(state.event.publicStatus, "hidden");
        assert.equal(state.event.publishCheckpoint.processedStands, 1);
        assert.equal(state.standUpdates, 1);
        assert.equal(first.headers["Retry-After"], "2");

        const second = await runtime.handler(publishRequest(), {
            getRemainingTimeInMillis: () => 20_000,
        });
        assert.equal(second.statusCode, 200);
        assert.equal(state.event.status, "published");
        assert.equal(state.event.publicationState, "published");
        assert.equal(state.event.publicStatus, "published");
        assert.ok(state.event.publishedAt);
        assert.equal(state.event.publishCheckpoint, undefined);
        assert.equal(state.standUpdates, 2);
    } finally {
        runtime.restore();
    }
});
