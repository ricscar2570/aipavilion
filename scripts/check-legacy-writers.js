#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
    canonicalStandProblems,
} = require("../backend/lambda/common/stand-domain");

const ROOT = path.resolve(__dirname, "..");
const INVENTORY_PATH = path.join(ROOT, "config", "writer-inventory.json");
const MUTATION_PATTERNS = [
    /\b(?:Put|Update|Delete|TransactWrite|BatchWrite|PutItem|UpdateItem|DeleteItem|TransactWriteItems)Command\b/,
    /\btransactWithAudit\s*\(/,
    /\b(?:reserveEventSlot|reserveStandSlot|consumeEventReservation|consumeStandReservation|releaseOccupancy|releaseSourceReservation|storeResponse|setCounterAbsolute|initializeCounter)\s*\(/,
];
const DISCOVERY_ROOTS = [
    "backend/lambda",
    "scripts/dev",
    "scripts/pilot",
    "scripts/quotas",
];

function relative(file) {
    return path.relative(ROOT, file).split(path.sep).join("/");
}

function walk(directory, results = []) {
    if (!fs.existsSync(directory)) {
        return results;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(full, results);
        } else if (entry.name.endsWith(".js")) {
            results.push(full);
        }
    }
    return results;
}

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function adminFunctionBlock(template) {
    const start = template.indexOf("  AdminFunction:");
    const end = template.indexOf("\n  UserSavedStandsFunction:", start);
    if (start < 0 || end < 0) {
        return "";
    }
    return template.slice(start, end);
}

function discoverMutationFiles() {
    const discovered = new Set();
    for (const root of DISCOVERY_ROOTS) {
        for (const file of walk(path.join(ROOT, root))) {
            const source = fs.readFileSync(file, "utf8");
            if (MUTATION_PATTERNS.some((pattern) => pattern.test(source))) {
                discovered.add(relative(file));
            }
        }
    }
    return discovered;
}

function runChecks() {
    const errors = [];
    const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf8"));
    const entries = inventory.writers || [];
    const declared = new Map(entries.map((entry) => [entry.path, entry]));
    const discovered = discoverMutationFiles();

    for (const file of discovered) {
        if (!declared.has(file)) {
            errors.push(`Undeclared mutation-capable file: ${file}`);
        }
    }
    for (const entry of entries) {
        const absolute = path.join(ROOT, entry.path);
        if (!fs.existsSync(absolute)) {
            errors.push(`Writer inventory path does not exist: ${entry.path}`);
        }
        if (!entry.mode || !entry.domain || !Array.isArray(entry.controls)) {
            errors.push(`Writer inventory entry is incomplete: ${entry.path}`);
        }
    }

    const admin = read("backend/lambda/admin/index.js");
    const adminForbidden = [
        "PutCommand",
        "UpdateCommand",
        "DeleteCommand",
        "TransactWriteCommand",
        "transactWithAudit(",
        "ar_enabled",
        "tour_enabled",
        'status: "approved"',
    ];
    for (const token of adminForbidden) {
        if (admin.includes(token)) {
            errors.push(
                `Read-only admin surface contains forbidden writer token: ${token}`,
            );
        }
    }
    if (!admin.includes("Platform-admin stand mutations are disabled")) {
        errors.push(
            "Admin handler does not fail closed for direct mutation invocation.",
        );
    }

    const template = read("template.yaml");
    const adminBlock = adminFunctionBlock(template);
    if (!adminBlock) {
        errors.push(
            "AdminFunction block could not be located in template.yaml.",
        );
    } else {
        if (adminBlock.includes("DynamoDBCrudPolicy")) {
            errors.push("AdminFunction still has a DynamoDBCrudPolicy.");
        }
        for (const route of ["/admin/stands", "/admin/stands/{standId}"]) {
            const routeIndex = adminBlock.indexOf(`Path: ${route}`);
            const nearby =
                routeIndex >= 0
                    ? adminBlock.slice(routeIndex, routeIndex + 220)
                    : "";
            if (!nearby.includes("Method: GET")) {
                errors.push(`Admin route is not read-only in SAM: ${route}`);
            }
        }
    }

    const packageJson = JSON.parse(read("package.json"));
    const packageLock = JSON.parse(read("package-lock.json"));
    const releaseState = JSON.parse(read("PROJECT-STATUS.json"));
    const expectedRelease = inventory.release;
    const versionSources = [
        ["package.json", packageJson.version],
        ["package-lock.json", packageLock.version],
        ["package-lock root package", packageLock.packages?.[""]?.version],
        ["release state", releaseState.version],
    ];
    for (const [source, version] of versionSources) {
        if (version !== expectedRelease) {
            errors.push(
                `Release version mismatch in ${source}: expected ${expectedRelease}, found ${version || "(missing)"}`,
            );
        }
    }

    const openapi = JSON.parse(read("docs/api/openapi.json"));
    if (openapi.info?.version !== expectedRelease) {
        errors.push(
            `Release version mismatch in OpenAPI: expected ${expectedRelease}, found ${openapi.info?.version || "(missing)"}`,
        );
    }
    for (const route of ["/admin/stands", "/admin/stands/{standId}"]) {
        const item = openapi.paths?.[route] || {};
        for (const method of ["post", "put", "patch", "delete"]) {
            if (item[method]) {
                errors.push(
                    `OpenAPI exposes forbidden admin mutation: ${method.toUpperCase()} ${route}`,
                );
            }
        }
        if (!item.get) {
            errors.push(
                `OpenAPI read-only admin route is missing GET: ${route}`,
            );
        }
    }

    for (const entry of entries.filter(
        (item) => item.mode === "synthetic-only",
    )) {
        const source = read(entry.path);
        if (!source.includes('require("./write-guard")')) {
            errors.push(
                `Synthetic writer does not import the write guard: ${entry.path}`,
            );
        }
        if (!source.includes("assertSyntheticWriteAllowed(")) {
            errors.push(
                `Synthetic writer does not invoke the write guard: ${entry.path}`,
            );
        }
    }

    const guard = read("scripts/dev/write-guard.js");
    for (const required of [
        "ALLOW_SYNTHETIC_FIXTURES",
        "production",
        "prod",
        "live",
    ]) {
        if (!guard.includes(required)) {
            errors.push(
                `Synthetic write guard is missing protection token: ${required}`,
            );
        }
    }

    const pilotMigration = read("scripts/pilot/migrate.js");
    if (
        !pilotMigration.includes(
            'const action = process.argv[2] || "status"',
        ) ||
        !pilotMigration.includes('["status", "plan", "apply", "verify"]')
    ) {
        errors.push(
            "Pilot migration writer is not guarded by an explicit action allowlist.",
        );
    }
    for (const file of [
        "scripts/quotas/migrate.js",
        "scripts/quotas/reconcile.js",
    ]) {
        if (!read(file).includes("--apply")) {
            errors.push(`Quota writer is not plan-only by default: ${file}`);
        }
    }

    for (const fixturePath of [
        "data/dev-fixtures.json",
        "data/sample-data.json",
    ]) {
        const fixtureDocument = JSON.parse(read(fixturePath));
        const stands = Array.isArray(fixtureDocument)
            ? fixtureDocument
            : fixtureDocument.stands;
        if (!Array.isArray(stands)) {
            errors.push(
                `Fixture document has no stand collection: ${fixturePath}`,
            );
            continue;
        }
        for (const stand of stands) {
            const problems = canonicalStandProblems(stand);
            if (problems.length) {
                errors.push(
                    `Non-canonical stand fixture ${fixturePath}:${stand?.stand_id || "(unknown)"}: ${problems.join(", ")}`,
                );
            }
            for (const retired of ["ar_enabled", "tour_enabled"]) {
                if (Object.hasOwn(stand || {}, retired)) {
                    errors.push(
                        `Stand fixture still contains retired field ${retired}: ${fixturePath}:${stand?.stand_id || "(unknown)"}`,
                    );
                }
            }
        }
    }

    const activeBackend = walk(path.join(ROOT, "backend", "lambda"))
        .map((file) => fs.readFileSync(file, "utf8"))
        .join("\n");
    for (const token of ["ar_enabled:", "tour_enabled:"]) {
        if (activeBackend.includes(token)) {
            errors.push(
                `Active backend still writes a retired legacy field: ${token}`,
            );
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        discovered: [...discovered].sort(),
        declared: [...declared.keys()].sort(),
        readOnlySurfaces: inventory.readOnlySurfaces || [],
    };
}

if (require.main === module) {
    const result = runChecks();
    if (!result.ok) {
        console.error("LEGACY-01 writer gate failed:\n");
        for (const error of result.errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }
    console.log(
        `LEGACY-01 writer gate passed: ${result.discovered.length} mutation-capable files declared; platform-admin stand surface is read-only.`,
    );
}

module.exports = { runChecks, discoverMutationFiles };
