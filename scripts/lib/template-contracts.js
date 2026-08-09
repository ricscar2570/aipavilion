"use strict";

const fs = require("fs");
const path = require("path");

function scalar(value) {
    return value.trim().replace(/^['"]|['"]$/g, "");
}

function sectionRange(lines, sectionName) {
    const start = lines.findIndex((line) => line === `${sectionName}:`);
    if (start < 0) return null;
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(lines[index])) {
            end = index;
            break;
        }
    }
    return { start: start + 1, end };
}

function parseBlocks(lines, range) {
    const blocks = new Map();
    if (!range) return blocks;
    let index = range.start;
    while (index < range.end) {
        const match = lines[index].match(/^  ([A-Za-z0-9]+):\s*$/);
        if (!match) {
            index += 1;
            continue;
        }
        const name = match[1];
        let end = index + 1;
        while (
            end < range.end &&
            !/^  [A-Za-z0-9]+:\s*$/.test(lines[end])
        ) {
            end += 1;
        }
        blocks.set(name, lines.slice(index, end));
        index = end;
    }
    return blocks;
}

function matchValue(block, key, indentation = null) {
    const prefix = indentation === null ? "\\s+" : ` {${indentation}}`;
    const expression = new RegExp(`^${prefix}${key}:\\s*(.+?)\\s*$`);
    for (const line of block) {
        const match = line.match(expression);
        if (match) return scalar(match[1]);
    }
    return null;
}

function parseEnvironment(block) {
    const variables = new Map();
    const start = block.findIndex((line) =>
        /^        Variables:\s*$/.test(line),
    );
    if (start < 0) return variables;
    for (let index = start + 1; index < block.length; index += 1) {
        const line = block[index];
        if (line.trim() && !line.startsWith("          ")) break;
        const match = line.match(/^          ([A-Z][A-Z0-9_]*):\s*(.*?)\s*$/);
        if (match) variables.set(match[1], scalar(match[2]));
    }
    return variables;
}

function parseTemplate(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const parameterBlocks = parseBlocks(
        lines,
        sectionRange(lines, "Parameters"),
    );
    const resourceBlocks = parseBlocks(
        lines,
        sectionRange(lines, "Resources"),
    );
    const outputBlocks = parseBlocks(lines, sectionRange(lines, "Outputs"));
    const resources = new Map();

    for (const [name, block] of resourceBlocks) {
        const type = matchValue(block, "Type", 4);
        const resource = { name, type, block };
        if (type === "AWS::DynamoDB::Table") {
            resource.indexes = [
                ...block
                    .join("\n")
                    .matchAll(/^\s+- IndexName:\s*([^\s#]+)\s*$/gm),
            ].map((match) => scalar(match[1]));
        }
        if (type === "AWS::Serverless::Function") {
            resource.codeUri = matchValue(block, "CodeUri", 6);
            resource.handler = matchValue(block, "Handler", 6);
            const entryMatch = block
                .join("\n")
                .match(/^\s+EntryPoints:\s*\[([^\]]+)\]\s*$/m);
            resource.entryPoints = entryMatch
                ? entryMatch[1].split(",").map((entry) => scalar(entry))
                : [];
            resource.environment = parseEnvironment(block);
            resource.policyTableRefs = new Set(
                [
                    ...block
                        .join("\n")
                        .matchAll(
                            /TableName:\s*!Ref\s+([A-Za-z0-9]+)/g,
                        ),
                ].map((match) => match[1]),
            );
        }
        resources.set(name, resource);
    }

    const outputs = new Map();
    for (const [name, block] of outputBlocks) {
        outputs.set(name, {
            name,
            value: matchValue(block, "Value", 4),
            block,
        });
    }

    return {
        parameters: new Set(parameterBlocks.keys()),
        resources,
        outputs,
    };
}

function refTarget(value) {
    const match = String(value || "").match(/^!Ref\s+([A-Za-z0-9]+)$/);
    return match ? match[1] : null;
}

function validateTemplate(text, { root, label }) {
    const model = parseTemplate(text);
    const errors = [];
    const tables = new Map();
    const indexOwners = new Map();

    for (const resource of model.resources.values()) {
        if (resource.type !== "AWS::DynamoDB::Table") continue;
        tables.set(resource.name, resource);
        for (const indexName of resource.indexes || []) {
            if (indexOwners.has(indexName)) {
                errors.push(
                    `${label}: index ${indexName} is declared by both ${indexOwners.get(indexName)} and ${resource.name}`,
                );
            } else {
                indexOwners.set(indexName, resource.name);
            }
        }
    }

    for (const resource of model.resources.values()) {
        if (resource.type !== "AWS::Serverless::Function") continue;
        if (!resource.codeUri || resource.codeUri.startsWith("!")) {
            errors.push(
                `${label}: ${resource.name} has no statically verifiable CodeUri`,
            );
        }
        if (!resource.handler) {
            errors.push(`${label}: ${resource.name} has no Handler`);
        } else if (resource.codeUri && !resource.codeUri.startsWith("!")) {
            const handlerModule = resource.handler.replace(/\.[^.]+$/, "");
            const handlerFile = path.join(
                root,
                resource.codeUri,
                `${handlerModule}.js`,
            );
            if (!fs.existsSync(handlerFile)) {
                errors.push(
                    `${label}: ${resource.name} handler file does not exist: ${path.relative(root, handlerFile)}`,
                );
            }
            const expectedEntry = `${handlerModule}.js`;
            if (
                resource.entryPoints.length &&
                !resource.entryPoints.includes(expectedEntry)
            ) {
                errors.push(
                    `${label}: ${resource.name} EntryPoints does not contain ${expectedEntry}`,
                );
            }
        }

        const referencedTables = new Set();
        for (const [key, value] of resource.environment || []) {
            const target = refTarget(value);
            if (
                target &&
                !model.resources.has(target) &&
                !model.parameters.has(target)
            ) {
                errors.push(
                    `${label}: ${resource.name}.${key} references unknown ${target}`,
                );
            }
            if (key.endsWith("_TABLE") || key.endsWith("_TABLE_NAME")) {
                if (!target || !tables.has(target)) {
                    errors.push(
                        `${label}: ${resource.name}.${key} must !Ref a DynamoDB table, found ${value || "empty"}`,
                    );
                } else {
                    referencedTables.add(target);
                    if (!resource.policyTableRefs.has(target)) {
                        errors.push(
                            `${label}: ${resource.name}.${key} references ${target} without a matching DynamoDB policy`,
                        );
                    }
                }
            }
        }
        for (const [key, value] of resource.environment || []) {
            if (!key.includes("INDEX")) continue;
            const indexName = scalar(value);
            const owner = indexOwners.get(indexName);
            if (!owner) {
                errors.push(
                    `${label}: ${resource.name}.${key} references undeclared DynamoDB index ${indexName}`,
                );
            } else if (
                !referencedTables.has(owner) &&
                !resource.policyTableRefs.has(owner)
            ) {
                errors.push(
                    `${label}: ${resource.name}.${key} uses ${indexName} from ${owner}, but the function does not reference that table`,
                );
            }
        }
    }

    for (const output of model.outputs.values()) {
        if (!output.name.endsWith("TableName")) continue;
        const target = refTarget(output.value);
        if (!target || !tables.has(target)) {
            errors.push(
                `${label}: output ${output.name} must !Ref a DynamoDB table, found ${output.value || "empty"}`,
            );
        }
    }

    return { errors, model, indexOwners };
}

module.exports = { parseTemplate, validateTemplate };
