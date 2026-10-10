#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILES = new Set([
    "MANIFEST.json",
    "MANIFEST.sha256",
    "RELEASE-MANIFEST.json",
    "RELEASE-MANIFEST.md",
    "RELEASE-MANIFEST.sha256",
]);
const EXCLUDED_DIRECTORIES = new Set([
    ".git",
    ".aws-sam",
    ".artifacts",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
]);
const EXCLUDED_PATH_PREFIXES = [
    "evidence/phase4.5g/runtime/",
    "evidence/internal-pilot/runtime/",
    "evidence/internal-pilot/approvals/",
    "evidence/internal-pilot/promotion/",
];

function posixRelative(file) {
    return path.relative(ROOT, file).split(path.sep).join("/");
}

function collectFiles(directory = ROOT, output = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
            entry.isDirectory() &&
            (EXCLUDED_DIRECTORIES.has(entry.name) ||
                entry.name.startsWith(".aws-sam-"))
        ) {
            continue;
        }
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectFiles(absolute, output);
            continue;
        }
        const relative = posixRelative(absolute);
        if (
            MANIFEST_FILES.has(relative) ||
            relative.endsWith(".pyc") ||
            EXCLUDED_PATH_PREFIXES.some((prefix) => relative.startsWith(prefix))
        ) {
            continue;
        }
        output.push(absolute);
    }
    return output;
}

function fileRecord(file) {
    const bytes = fs.readFileSync(file);
    return {
        path: posixRelative(file),
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
}

function records() {
    return collectFiles()
        .map(fileRecord)
        .sort((left, right) => left.path.localeCompare(right.path));
}

function checksumText(items) {
    return `${items.map((item) => `${item.sha256}  ${item.path}`).join("\n")}\n`;
}

function generate() {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    const projectStatus = JSON.parse(
        fs.readFileSync(path.join(ROOT, "PROJECT-STATUS.json"), "utf8"),
    );
    const items = records();
    const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
    const excludes = [...MANIFEST_FILES].sort();

    const manifest = {
        project: "AI Pavilion",
        version: packageJson.version,
        algorithm: "SHA-256",
        manifestExcludes: excludes,
        fileCount: items.length,
        totalBytes,
        files: items,
    };
    const releaseManifest = {
        project: "AI Pavilion",
        version: packageJson.version,
        snapshotDate: projectStatus.snapshot_date,
        snapshotName: projectStatus.snapshot_type,
        status: projectStatus.product_state,
        manifestExcludes: excludes,
        fileCount: items.length,
        totalBytes,
        files: items.map((item) => ({
            path: item.path,
            sizeBytes: item.bytes,
            sha256: item.sha256,
        })),
    };

    fs.writeFileSync(
        path.join(ROOT, "MANIFEST.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(ROOT, "MANIFEST.sha256"), checksumText(items));
    fs.writeFileSync(
        path.join(ROOT, "RELEASE-MANIFEST.json"),
        `${JSON.stringify(releaseManifest, null, 2)}\n`,
    );
    fs.writeFileSync(
        path.join(ROOT, "RELEASE-MANIFEST.sha256"),
        checksumText(items),
    );
    fs.writeFileSync(
        path.join(ROOT, "RELEASE-MANIFEST.md"),
        [
            "# AI Pavilion release manifest",
            "",
            `- Version: \`${packageJson.version}\``,
            `- Snapshot date: \`${projectStatus.snapshot_date}\``,
            `- State: ${projectStatus.product_state}`,
            `- Files covered: **${items.length}**`,
            `- Bytes covered: **${totalBytes}**`,
            "",
            "The five manifest files are excluded to avoid recursive hashes. Generated dependencies, build output, Git metadata and runtime evidence are not part of the source package.",
            "",
            "## Verification",
            "",
            "```bash",
            "sha256sum -c RELEASE-MANIFEST.sha256",
            "```",
            "",
        ].join("\n"),
    );
    return {
        version: packageJson.version,
        fileCount: items.length,
        totalBytes,
    };
}

function verify() {
    const manifestPath = path.join(ROOT, "MANIFEST.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error("MANIFEST.json is missing");
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const actual = records();
    const expected = new Map(manifest.files.map((item) => [item.path, item]));
    const errors = [];

    if (manifest.fileCount !== actual.length) {
        errors.push(
            `file count differs: manifest=${manifest.fileCount}, actual=${actual.length}`,
        );
    }
    for (const item of actual) {
        const recorded = expected.get(item.path);
        if (!recorded) {
            errors.push(`unmanifested file: ${item.path}`);
            continue;
        }
        if (recorded.bytes !== item.bytes || recorded.sha256 !== item.sha256) {
            errors.push(`digest or size mismatch: ${item.path}`);
        }
        expected.delete(item.path);
    }
    for (const missing of expected.keys()) {
        errors.push(`missing file: ${missing}`);
    }
    if (errors.length) {
        throw new Error(`Manifest verification failed:\n${errors.join("\n")}`);
    }
    return { version: manifest.version, fileCount: actual.length };
}

const command = process.argv[2] || "verify";
if (command === "generate") {
    const result = generate();
    console.log(
        `Release manifests generated for ${result.version}: ${result.fileCount} files, ${result.totalBytes} bytes.`,
    );
} else if (command === "verify") {
    const result = verify();
    console.log(
        `Release manifest verification passed for ${result.version}: ${result.fileCount} files.`,
    );
} else {
    console.error("Usage: node scripts/release/manifest.js [generate|verify]");
    process.exitCode = 2;
}
