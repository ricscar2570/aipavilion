#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validateTemplate } = require("./lib/template-contracts");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "template.yaml");
const pilotPath = path.join(root, "infrastructure", "backend-pilot.yaml");
const sourceText = fs.readFileSync(sourcePath, "utf8");
const pilotText = fs.readFileSync(pilotPath, "utf8");
const source = validateTemplate(sourceText, { root, label: "template.yaml" });
const pilot = validateTemplate(pilotText, {
    root,
    label: "infrastructure/backend-pilot.yaml",
});
const errors = [...source.errors, ...pilot.errors];

const sourceResources = new Map(
    [...source.model.resources].map(([name, resource]) => [
        name,
        resource.type,
    ]),
);
const pilotResources = new Map(
    [...pilot.model.resources].map(([name, resource]) => [
        name,
        resource.type,
    ]),
);
for (const [name, type] of sourceResources) {
    if (pilotResources.get(name) !== type) {
        errors.push(
            `pilot resource drift: ${name} is ${type} in template.yaml and ${pilotResources.get(name) || "missing"} in backend-pilot.yaml`,
        );
    }
}
for (const name of pilotResources.keys()) {
    if (!sourceResources.has(name)) {
        errors.push(
            `pilot resource drift: ${name} exists only in backend-pilot.yaml`,
        );
    }
}

const mutated = sourceText.replace(
    "USER_SAVED_INDEX: user-saved-at-index",
    "USER_SAVED_INDEX: deliberately-missing-index",
);
const regression = validateTemplate(mutated, {
    root,
    label: "semantic-regression-fixture",
});
if (
    !regression.errors.some((error) =>
        error.includes("deliberately-missing-index"),
    )
) {
    errors.push(
        "semantic validator regression: an undeclared index was not detected",
    );
}

if (errors.length) {
    console.error("Infrastructure contract check failed:\n");
    for (const error of [...new Set(errors)]) console.error(`- ${error}`);
    process.exit(1);
}

console.log(
    `Infrastructure contract check passed: ${source.model.resources.size} resources, ${source.indexOwners.size} DynamoDB indexes and all Lambda table/index contracts are coherent in development and pilot templates.`,
);
