#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
const codeUri = "backend/lambda/";
const entries = [
    ...template.matchAll(/^\s+EntryPoints:\s+\[([^\]]+)\]\s*$/gm),
].flatMap((match) =>
    match[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
);

if (entries.length === 0) {
    console.error("No Lambda esbuild entry points found in template.yaml.");
    process.exit(1);
}

const uniqueEntries = [...new Set(entries)];
const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ai-pavilion-lambda-build-"),
);

async function main() {
    try {
        for (const entry of uniqueEntries) {
            const entryPoint = path.join(root, codeUri, entry);
            const outputFile = path.join(
                tempDirectory,
                entry.replace(/[\\/]/g, "-"),
            );
            await esbuild.build({
                entryPoints: [entryPoint],
                outfile: outputFile,
                bundle: true,
                platform: "node",
                target: "node20",
                format: "cjs",
                minify: true,
                sourcemap: false,
                logLevel: "silent",
            });
        }
        console.log(
            `Lambda bundle check passed for ${uniqueEntries.length} functions.`,
        );
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("Lambda bundle check failed:", error.message);
    process.exit(1);
});
