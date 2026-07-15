"use strict";

const crypto = require("crypto");
const fs = require("fs");
const {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminGetUserCommand,
    InitiateAuthCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { readStackOutputs } = require("./stack-outputs");

const outputs = readStackOutputs();
const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const apiBase = outputs.ApiEndpoint.replace(/\/$/, "");
const cognito = new CognitoIdentityProviderClient({ region });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

function readCredentials() {
    const path =
        process.env.DEV_TEST_USERS_FILE || ".artifacts/dev-test-users.json";
    if (!fs.existsSync(path)) {
        throw new Error(`Development test users not found at ${path}`);
    }
    return JSON.parse(fs.readFileSync(path, "utf8")).users;
}

async function rawRequest(path, options = {}) {
    const requestId = `smoke-${crypto.randomUUID()}`;
    const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }
    if (response.headers.get("x-request-id") !== requestId) {
        throw new Error(`${path} did not preserve the correlation identifier`);
    }
    return { response, body };
}

async function request(path, options = {}) {
    const result = await rawRequest(path, options);
    if (!result.response.ok) {
        throw new Error(
            `${options.method || "GET"} ${path} returned ${result.response.status}: ${JSON.stringify(result.body)}`,
        );
    }
    return result;
}

async function expectStatus(path, expectedStatus, options = {}) {
    const result = await rawRequest(path, options);
    if (result.response.status !== expectedStatus) {
        throw new Error(
            `${options.method || "GET"} ${path} returned ${result.response.status}, expected ${expectedStatus}: ${JSON.stringify(result.body)}`,
        );
    }
    return result;
}

async function login(email, password) {
    const result = await cognito.send(
        new InitiateAuthCommand({
            ClientId: outputs.UserPoolClientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
    );
    const idToken = result.AuthenticationResult?.IdToken;
    const accessToken = result.AuthenticationResult?.AccessToken;
    if (!idToken || !accessToken) {
        throw new Error(`Cognito did not return complete tokens for ${email}`);
    }
    return { idToken, accessToken };
}

function bearer(token) {
    return { Authorization: `Bearer ${token}` };
}

function cognitoAttribute(user, name) {
    return user.UserAttributes?.find((item) => item.Name === name)?.Value;
}

async function createDisposableDeletionUser(password) {
    const email = `delete-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
    await cognito.send(
        new AdminCreateUserCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
            MessageAction: "SUPPRESS",
            UserAttributes: [
                { Name: "email", Value: email },
                { Name: "email_verified", Value: "true" },
                { Name: "given_name", Value: "Deletion Smoke" },
            ],
        }),
    );
    await cognito.send(
        new AdminSetUserPasswordCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
            Password: password,
            Permanent: true,
        }),
    );
    const user = await cognito.send(
        new AdminGetUserCommand({
            UserPoolId: outputs.UserPoolId,
            Username: email,
        }),
    );
    const userId = cognitoAttribute(user, "sub");
    await dynamo.send(
        new PutCommand({
            TableName: outputs.UsersTableName,
            Item: {
                userId,
                email,
                displayName: "Deletion Smoke",
                role: "visitor",
                createdAt: new Date().toISOString(),
            },
        }),
    );
    return { email, userId };
}

async function assertDeletedCognitoUser(email) {
    try {
        await cognito.send(
            new AdminGetUserCommand({
                UserPoolId: outputs.UserPoolId,
                Username: email,
            }),
        );
    } catch (error) {
        if (error.name === "UserNotFoundException") {
            return;
        }
        throw error;
    }
    throw new Error("Account deletion did not remove the Cognito user");
}

async function main() {
    const credentials = readCredentials();
    const visitor = credentials.find((item) => item.group === "visitor");
    const admin = credentials.find((item) => item.group === "admin");
    const atlasOrganizer = credentials.find((item) =>
        item.email.startsWith("organizer.atlas."),
    );
    const atlasExhibitor = credentials.find((item) =>
        item.email.startsWith("exhibitor.atlas."),
    );
    const rivalExhibitor = credentials.find((item) =>
        item.email.startsWith("exhibitor.rival."),
    );
    if (
        !visitor ||
        !admin ||
        !atlasOrganizer ||
        !atlasExhibitor ||
        !rivalExhibitor
    ) {
        throw new Error(
            "Visitor, admin and two-tenant organizer/exhibitor users are required",
        );
    }

    const visitorTokens = await login(visitor.email, visitor.password);
    const adminTokens = await login(admin.email, admin.password);
    const organizerTokens = await login(
        atlasOrganizer.email,
        atlasOrganizer.password,
    );
    const atlasExhibitorTokens = await login(
        atlasExhibitor.email,
        atlasExhibitor.password,
    );
    const rivalExhibitorTokens = await login(
        rivalExhibitor.email,
        rivalExhibitor.password,
    );
    const visitorToken = visitorTokens.accessToken;
    const adminToken = adminTokens.accessToken;
    const organizerToken = organizerTokens.accessToken;
    const atlasExhibitorToken = atlasExhibitorTokens.accessToken;
    const rivalExhibitorToken = rivalExhibitorTokens.accessToken;

    const { body: publicEventsBody } = await request("/events");
    if (
        !publicEventsBody.events?.some(
            (candidate) => candidate.eventId === "evt_atlas_2026",
        ) ||
        !publicEventsBody.events?.some(
            (candidate) => candidate.eventId === "evt_rival_2026",
        )
    ) {
        throw new Error("Public multi-tenant event catalogue is incomplete");
    }
    const { body: membershipsBody } = await request("/me/memberships", {
        headers: bearer(organizerToken),
    });
    if (
        !membershipsBody.memberships?.some(
            (membership) => membership.organizationId === "org_atlas",
        )
    ) {
        throw new Error("Atlas organizer membership was not returned");
    }
    await request("/organizations/org_atlas/events", {
        headers: bearer(organizerToken),
    });
    await expectStatus("/organizations/org_rival/events", 403, {
        headers: bearer(organizerToken),
    });
    const { body: atlasOwnedStands } = await request("/exhibitor/stands", {
        headers: bearer(atlasExhibitorToken),
    });
    if (
        !atlasOwnedStands.stands?.some(
            (candidate) => candidate.stand_id === "stand_boardgames_atlas",
        )
    ) {
        throw new Error("Atlas exhibitor ownership query failed");
    }
    await expectStatus("/exhibitor/stands/stand_rival_showcase", 404, {
        headers: bearer(atlasExhibitorToken),
    });
    const { body: rivalOwnedStands } = await request("/exhibitor/stands", {
        headers: bearer(rivalExhibitorToken),
    });
    if (
        !rivalOwnedStands.stands?.some(
            (candidate) => candidate.stand_id === "stand_rival_showcase",
        )
    ) {
        throw new Error("Rival exhibitor ownership query failed");
    }

    const { body: standsBody } = await request("/stands");
    const stand = standsBody?.stands?.find(
        (candidate) => candidate.stand_id === "stand_boardgames_atlas",
    );
    if (!stand || !stand.products?.length) {
        throw new Error("Canonical seeded stand is missing");
    }
    if (
        standsBody.stands.some(
            (candidate) => candidate.stand_id === "stand_unpublished_preview",
        )
    ) {
        throw new Error(
            "An unpublished stand leaked into the public catalogue",
        );
    }
    await expectStatus("/stands/stand_unpublished_preview", 404);
    await expectStatus("/user/saved-stands", 401);
    await expectStatus("/admin/dashboard", 403, {
        headers: bearer(visitorToken),
    });

    await request("/user/saved-stands", {
        method: "POST",
        headers: bearer(visitorToken),
        body: JSON.stringify({ standId: stand.stand_id }),
    });
    const { body: savedBody } = await request("/user/saved-stands", {
        headers: bearer(visitorToken),
    });
    if (!savedBody.stands.some((item) => item.standId === stand.stand_id)) {
        throw new Error("Saved stand did not persist");
    }

    const leadRequestId = `lead-${crypto.randomUUID()}`;
    await expectStatus("/stands/contact", 400, {
        method: "POST",
        headers: { "Idempotency-Key": `${leadRequestId}-mismatch` },
        body: JSON.stringify({
            standId: stand.stand_id,
            name: "Smoke Test",
            email: visitor.email,
            message: "This request must be rejected.",
            privacyAccepted: true,
            website: "",
            clientRequestId: leadRequestId,
        }),
    });
    const { body: leadBody } = await request("/stands/contact", {
        method: "POST",
        headers: { "Idempotency-Key": leadRequestId },
        body: JSON.stringify({
            standId: stand.stand_id,
            name: "Smoke Test",
            email: visitor.email,
            message: "Automated deployed smoke test lead.",
            privacyAccepted: true,
            website: "",
            clientRequestId: leadRequestId,
        }),
    });
    const { body: replayedLeadBody } = await request("/stands/contact", {
        method: "POST",
        headers: { "Idempotency-Key": leadRequestId },
        body: JSON.stringify({
            standId: stand.stand_id,
            name: "Smoke Test",
            email: visitor.email,
            message: "Automated deployed smoke test lead.",
            privacyAccepted: true,
            website: "",
            clientRequestId: leadRequestId,
        }),
    });
    if (
        replayedLeadBody.leadId !== leadBody.leadId ||
        !replayedLeadBody.duplicate
    ) {
        throw new Error("Lead idempotency replay failed");
    }

    const persistedLead = await dynamo.send(
        new GetCommand({
            TableName: outputs.LeadsTableName,
            Key: { leadId: leadBody.leadId },
            ConsistentRead: true,
        }),
    );
    if (
        persistedLead.Item?.standId !== stand.stand_id ||
        persistedLead.Item?.organizationId !== "org_atlas" ||
        persistedLead.Item?.eventId !== "evt_atlas_2026"
    ) {
        throw new Error("Tenant-scoped lead was not persisted in DynamoDB");
    }
    const { body: exhibitorLeads } = await request(
        `/exhibitor/leads?standId=${encodeURIComponent(stand.stand_id)}`,
        { headers: bearer(atlasExhibitorToken) },
    );
    if (
        !exhibitorLeads.leads?.some((lead) => lead.leadId === leadBody.leadId)
    ) {
        throw new Error(
            "Exhibitor lead query did not return the persisted lead",
        );
    }
    await request(`/exhibitor/leads/${encodeURIComponent(leadBody.leadId)}`, {
        method: "PATCH",
        headers: bearer(atlasExhibitorToken),
        body: JSON.stringify({ status: "contacted" }),
    });
    await expectStatus(
        `/exhibitor/leads?standId=${encodeURIComponent("stand_rival_showcase")}`,
        404,
        { headers: bearer(atlasExhibitorToken) },
    );

    const interactionRequestId = `interaction-${crypto.randomUUID()}`;
    await expectStatus("/interactions", 400, {
        method: "POST",
        headers: { "X-Interaction-Id": interactionRequestId },
        body: JSON.stringify({
            standId: stand.stand_id,
            interactionType: "purchase",
            clientRequestId: interactionRequestId,
            sessionId: `session-${crypto.randomUUID()}`,
        }),
    });

    const product = stand.products[0];
    const checkoutRequestId = `checkout-${crypto.randomUUID()}`;
    const { body: intentBody } = await request("/checkout/create-intent", {
        method: "POST",
        headers: {
            ...bearer(visitorToken),
            "Idempotency-Key": checkoutRequestId,
        },
        body: JSON.stringify({
            customerEmail: visitor.email,
            checkoutRequestId,
            items: [
                {
                    standId: stand.stand_id,
                    productId: product.id,
                    quantity: 1,
                },
            ],
        }),
    });
    const { body: replayedIntentBody } = await request(
        "/checkout/create-intent",
        {
            method: "POST",
            headers: {
                ...bearer(visitorToken),
                "Idempotency-Key": checkoutRequestId,
            },
            body: JSON.stringify({
                customerEmail: visitor.email,
                checkoutRequestId,
                items: [
                    {
                        standId: stand.stand_id,
                        productId: product.id,
                        quantity: 1,
                    },
                ],
            }),
        },
    );
    if (
        replayedIntentBody.orderId !== intentBody.orderId ||
        replayedIntentBody.paymentIntentId !== intentBody.paymentIntentId ||
        !replayedIntentBody.idempotentReplay
    ) {
        throw new Error("Checkout idempotency replay failed");
    }
    await expectStatus("/checkout/create-intent", 400, {
        method: "POST",
        headers: {
            ...bearer(visitorToken),
            "Idempotency-Key": `${checkoutRequestId}-mismatch`,
        },
        body: JSON.stringify({
            customerEmail: visitor.email,
            checkoutRequestId,
            items: [
                {
                    standId: stand.stand_id,
                    productId: product.id,
                    quantity: 1,
                },
            ],
        }),
    });
    await expectStatus("/checkout/create-intent", 409, {
        method: "POST",
        headers: {
            ...bearer(visitorToken),
            "Idempotency-Key": checkoutRequestId,
        },
        body: JSON.stringify({
            customerEmail: visitor.email,
            checkoutRequestId,
            items: [
                {
                    standId: stand.stand_id,
                    productId: product.id,
                    quantity: 2,
                },
            ],
        }),
    });

    if (intentBody.paymentMode !== "simulated") {
        throw new Error(
            "The disposable dev stack is not using simulated payments",
        );
    }
    await request("/checkout/confirm-order", {
        method: "POST",
        headers: bearer(visitorToken),
        body: JSON.stringify({
            orderId: intentBody.orderId,
            paymentIntentId: intentBody.paymentIntentId,
        }),
    });
    const { body: orderBody } = await request(
        `/checkout/order/${encodeURIComponent(intentBody.orderId)}`,
        { headers: bearer(visitorToken) },
    );
    if (orderBody.status !== "paid") {
        throw new Error("Simulated checkout did not produce a paid order");
    }
    await expectStatus(
        `/checkout/order/${encodeURIComponent(intentBody.orderId)}`,
        403,
        { headers: bearer(adminToken) },
    );

    const { body: dashboardBody } = await request("/admin/dashboard", {
        headers: bearer(adminToken),
    });
    if (!Number.isFinite(dashboardBody.totalStands)) {
        throw new Error("Admin dashboard smoke test failed");
    }

    const deletionPassword = visitor.password;
    const deletionUser = await createDisposableDeletionUser(deletionPassword);
    const deletionTokens = await login(deletionUser.email, deletionPassword);
    const deleteResult = await request("/user/account", {
        method: "DELETE",
        headers: bearer(deletionTokens.accessToken),
    });
    if (deleteResult.response.status !== 204) {
        throw new Error("Account deletion did not return 204");
    }
    await assertDeletedCognitoUser(deletionUser.email);

    console.log(
        JSON.stringify(
            {
                status: "passed",
                standId: stand.stand_id,
                leadId: leadBody.leadId,
                orderId: intentBody.orderId,
                adminTotalStands: dashboardBody.totalStands,
                tenantIsolation: "passed",
                organizerMemberships: membershipsBody.count,
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
