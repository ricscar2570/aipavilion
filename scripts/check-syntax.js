#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const { readdirSync, statSync } = require("fs");
const { join, relative } = require("path");

const ROOT = join(__dirname, "..");
const TARGETS = ["backend", "scripts", "tests"];
const ignored = new Set(["node_modules", "dist", ".aws-sam", "coverage"]);
const files = [];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        if (ignored.has(name)) {
            continue;
        }
        const full = join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            walk(full);
        } else if (name.endsWith(".js")) {
            files.push(full);
        }
    }
}

for (const target of TARGETS) {
    walk(join(ROOT, target));
}

const failures = [];
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
    });
    if (result.status !== 0) {
        failures.push({
            file: relative(ROOT, file),
            error: result.stderr.trim(),
        });
    }
}

if (failures.length) {
    for (const failure of failures) {
        console.error(`Syntax error in ${failure.file}\n${failure.error}`);
    }
    process.exit(1);
}

console.log(`Syntax check passed for ${files.length} Node.js files.`);
