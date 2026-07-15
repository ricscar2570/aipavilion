"use strict";

const fs = require("fs");
const path = require("path");

function readStackOutputs(filePath = process.env.STACK_OUTPUTS_FILE) {
    const resolved = path.resolve(
        filePath || ".artifacts/dev-stack-outputs.json",
    );
    if (!fs.existsSync(resolved)) {
        throw new Error(
            `Stack outputs not found at ${resolved}. Deploy the dev stack first.`,
        );
    }
    const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (Array.isArray(raw)) {
        return Object.fromEntries(
            raw.map((entry) => [entry.OutputKey, entry.OutputValue]),
        );
    }
    return raw;
}

module.exports = { readStackOutputs };
