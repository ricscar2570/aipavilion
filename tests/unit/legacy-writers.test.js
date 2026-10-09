"use strict";

const fs = require("fs");
const path = require("path");
const {
    runChecks,
    discoverMutationFiles,
} = require("../../scripts/check-legacy-writers");

const ROOT = path.resolve(__dirname, "../..");

describe("LEGACY-01 canonical writer boundary", () => {
    test("declares every mutation-capable source and keeps the admin surface read-only", () => {
        const result = runChecks();
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.discovered).toEqual(
            expect.arrayContaining([
                "backend/lambda/events/index.js",
                "backend/lambda/invitations/index.js",
                "scripts/dev/seed-dev.js",
            ]),
        );
        expect(result.readOnlySurfaces).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "backend/lambda/admin/index.js",
                }),
            ]),
        );
    });

    test("the discovered writer set is exactly covered by the inventory", () => {
        const inventory = JSON.parse(
            fs.readFileSync(
                path.join(ROOT, "config/writer-inventory.json"),
                "utf8",
            ),
        );
        const declared = new Set(inventory.writers.map((item) => item.path));
        for (const writer of discoverMutationFiles()) {
            expect(declared.has(writer)).toBe(true);
        }
    });

    test("OpenAPI exposes no platform-admin stand mutation", () => {
        const openapi = JSON.parse(
            fs.readFileSync(path.join(ROOT, "docs/api/openapi.json"), "utf8"),
        );
        for (const route of ["/admin/stands", "/admin/stands/{standId}"]) {
            expect(openapi.paths[route].get).toBeDefined();
            for (const method of ["post", "put", "patch", "delete"]) {
                expect(openapi.paths[route][method]).toBeUndefined();
            }
        }
    });
});
