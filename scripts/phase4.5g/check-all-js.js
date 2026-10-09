#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
function walk(dir, out = []) {
    if (!fs.existsSync(dir)) {
        return out;
    }
    for (const name of fs.readdirSync(dir)) {
        if (
            [
                ".git",
                "node_modules",
                "dist",
                "build",
                "coverage",
                ".aws-sam",
            ].includes(name)
        ) {
            continue;
        }
        const file = path.join(dir, name);
        const stat = fs.statSync(file);
        if (stat.isDirectory()) {
            walk(file, out);
        } else if (file.endsWith(".js")) {
            out.push(file);
        }
    }
    return out;
}
const files = [
    ...walk("backend"),
    ...walk("scripts/phase4.5g"),
    ...walk("tests/node"),
];
for (const file of files) {
    const r = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
    });
    if (r.status !== 0) {
        console.error(r.stdout, r.stderr);
        process.exit(r.status || 1);
    }
}
console.log(
    `PASS: ${files.length} CommonJS/runtime JavaScript files parse; frontend ESM remains covered by the project build gate when dependencies are installed.`,
);
