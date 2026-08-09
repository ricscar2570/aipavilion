"use strict";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt, baseMs = 25, maxMs = 1000) {
    const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
    return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

async function retryUnprocessedBatchGet(
    client,
    Command,
    initialRequestItems,
    options = {},
) {
    const maxAttempts = options.maxAttempts || 6;
    const responses = {};
    let requestItems = initialRequestItems;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await client.send(
            new Command({ RequestItems: requestItems }),
        );
        for (const [tableName, items] of Object.entries(
            result.Responses || {},
        )) {
            responses[tableName] = [
                ...(responses[tableName] || []),
                ...(items || []),
            ];
        }

        const unprocessed = result.UnprocessedKeys || {};
        const remaining = Object.values(unprocessed).some(
            (entry) => Array.isArray(entry?.Keys) && entry.Keys.length > 0,
        );
        if (!remaining) {
            return responses;
        }

        requestItems = unprocessed;
        if (attempt < maxAttempts - 1) {
            await sleep(backoffDelay(attempt));
        }
    }

    const error = new Error("DynamoDB batch get remained partially unprocessed");
    error.code = "DYNAMODB_UNPROCESSED_KEYS";
    throw error;
}

module.exports = { sleep, backoffDelay, retryUnprocessedBatchGet };
