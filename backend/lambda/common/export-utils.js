"use strict";

const DEFAULT_MAX_PAGES = 10000;
const CSV_FORMULA_PREFIX = "'";

class ExportLimitError extends Error {
    constructor({ code = "EXPORT_TOO_LARGE", maxItems, observedItems }) {
        super(code);
        this.name = "ExportLimitError";
        this.code = code;
        this.maxItems = maxItems;
        this.observedItems = observedItems;
    }
}

function positiveInteger(
    value,
    fallback,
    minimum = 1,
    maximum = Number.MAX_SAFE_INTEGER,
) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isSafeInteger(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeCsvText(value) {
    return String(value ?? "").split("\u0000").join("").replace(/\r\n|\r|\n/g, " ");
}

function hasDangerousSpreadsheetPrefix(value) {
    for (const character of value) {
        if (character.charCodeAt(0) <= 0x20) {
            continue;
        }
        return "=+-@".includes(character);
    }
    return false;
}

function neutralizeSpreadsheetFormula(value) {
    const normalized = normalizeCsvText(value);
    return hasDangerousSpreadsheetPrefix(normalized)
        ? `${CSV_FORMULA_PREFIX}${normalized}`
        : normalized;
}

function csvCell(value) {
    const safe = neutralizeSpreadsheetFormula(value).replace(/"/g, '""');
    return `"${safe}"`;
}

function csvDocument(rows, { bom = true, lineEnding = "\r\n" } = {}) {
    const body = rows
        .map((row) => row.map((value) => csvCell(value)).join(","))
        .join(lineEnding);
    return `${bom ? "\uFEFF" : ""}${body}`;
}

async function queryAllPages({
    client,
    QueryCommand,
    input,
    select = (item) => item,
    predicate = () => true,
    maxItems = Number.MAX_SAFE_INTEGER,
    maxPages = DEFAULT_MAX_PAGES,
    pageLimit,
}) {
    if (!client || typeof client.send !== "function") {
        throw new TypeError("A DynamoDB document client is required");
    }
    const items = [];
    let lastKey = input.ExclusiveStartKey;
    let pages = 0;
    do {
        pages += 1;
        if (pages > maxPages) {
            throw new ExportLimitError({
                code: "EXPORT_PAGE_LIMIT_EXCEEDED",
                maxItems,
                observedItems: items.length,
            });
        }
        const result = await client.send(
            new QueryCommand({
                ...input,
                ...(pageLimit ? { Limit: pageLimit } : {}),
                ExclusiveStartKey: lastKey,
            }),
        );
        for (const raw of result.Items || []) {
            if (!predicate(raw)) {
                continue;
            }
            items.push(select(raw));
            if (items.length > maxItems) {
                throw new ExportLimitError({
                    maxItems,
                    observedItems: items.length,
                });
            }
        }
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return { items, pages };
}

async function queryMatchingPage({
    client,
    QueryCommand,
    input,
    predicate = () => true,
    select = (item) => item,
    requestedLimit,
    maxPagesPerRequest = 100,
    pageLimit = 100,
}) {
    const items = [];
    let lastKey = input.ExclusiveStartKey;
    let pages = 0;
    do {
        pages += 1;
        const remaining = Math.max(1, requestedLimit - items.length);
        const result = await client.send(
            new QueryCommand({
                ...input,
                Limit: Math.min(pageLimit, remaining),
                ExclusiveStartKey: lastKey,
            }),
        );
        for (const raw of result.Items || []) {
            if (!predicate(raw)) {
                continue;
            }
            items.push(select(raw));
        }
        lastKey = result.LastEvaluatedKey;
        if (items.length >= requestedLimit || !lastKey) {
            break;
        }
    } while (pages < maxPagesPerRequest);
    return {
        items,
        nextKey: lastKey,
        pages,
        pageCapReached: Boolean(lastKey && pages >= maxPagesPerRequest),
    };
}

function approximateJsonBytes(value) {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

module.exports = {
    ExportLimitError,
    positiveInteger,
    normalizeCsvText,
    neutralizeSpreadsheetFormula,
    csvCell,
    csvDocument,
    queryAllPages,
    queryMatchingPage,
    approximateJsonBytes,
};
