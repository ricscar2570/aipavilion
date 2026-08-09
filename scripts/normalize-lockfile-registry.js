#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const lockPath = path.join(root, "package-lock.json");
const publicRegistry = "https://registry.npmjs.org";
let changes = 0;

function publicTarballUrl(resolved) {
    const url = new URL(resolved);
    if (url.hostname === "registry.npmjs.org") return resolved;
    const marker = "/api/npm/npm-public/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) {
        throw new Error(`Cannot normalize unknown registry URL: ${resolved}`);
    }
    const packagePath = url.pathname.slice(markerIndex + marker.length);
    changes += 1;
    return `${publicRegistry}/${packagePath}`;
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
for (const metadata of Object.values(lock.packages || {})) {
    if (metadata && typeof metadata.resolved === "string") {
        metadata.resolved = publicTarballUrl(metadata.resolved);
    }
}
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Normalized ${changes} package-lock registry URLs.`);
