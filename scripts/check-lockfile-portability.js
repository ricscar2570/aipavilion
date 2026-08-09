#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const lockPath = path.join(root, "package-lock.json");
const packagePath = path.join(root, "package.json");
const npmrcPath = path.join(root, ".npmrc");
const allowedRegistryHosts = new Set(["registry.npmjs.org"]);
const forbiddenHostFragments = [
    ".internal.",
    "localhost",
    "127.0.0.1",
    "artifactory",
];

function collectResolvedEntries(lock) {
    const entries = [];
    for (const [packagePath, metadata] of Object.entries(lock.packages || {})) {
        if (metadata && typeof metadata.resolved === "string") {
            entries.push({ packagePath, resolved: metadata.resolved });
        }
    }
    return entries;
}

function validateLockfile(lock, packageJson = {}) {
    const errors = [];
    if (lock.lockfileVersion !== 3) {
        errors.push(
            `package-lock.json must use lockfileVersion 3, found ${lock.lockfileVersion}`,
        );
    }
    if (!lock.packages || !lock.packages[""]) {
        errors.push("package-lock.json does not contain the root package entry");
    }
    if (lock.name !== packageJson.name || lock.version !== packageJson.version) {
        errors.push(
            "package.json and package-lock.json name/version are not aligned",
        );
    }

    const rootPackage = lock.packages?.[""] || {};
    for (const dependencyType of ["dependencies", "devDependencies"]) {
        const declared = packageJson[dependencyType] || {};
        const locked = rootPackage[dependencyType] || {};
        for (const [name, range] of Object.entries(declared)) {
            if (locked[name] !== range) {
                errors.push(
                    `${dependencyType}.${name} differs between package.json (${range}) and package-lock.json (${locked[name] || "missing"})`,
                );
            }
            if (!lock.packages?.[`node_modules/${name}`]) {
                errors.push(
                    `${dependencyType}.${name} has no installed package entry in package-lock.json`,
                );
            }
        }
        for (const name of Object.keys(locked)) {
            if (!(name in declared)) {
                errors.push(
                    `${dependencyType}.${name} exists only in package-lock.json`,
                );
            }
        }
    }

    for (const { packagePath, resolved } of collectResolvedEntries(lock)) {
        let url;
        try {
            url = new URL(resolved);
        } catch {
            errors.push(
                `${packagePath || "root"} has a non-URL resolved value: ${resolved}`,
            );
            continue;
        }
        const host = url.hostname.toLowerCase();
        if (!allowedRegistryHosts.has(host)) {
            errors.push(
                `${packagePath || "root"} resolves from non-portable host ${host}`,
            );
        }
        if (forbiddenHostFragments.some((fragment) => host.includes(fragment))) {
            errors.push(
                `${packagePath || "root"} resolves from forbidden host ${host}`,
            );
        }
        if (
            url.username ||
            url.password ||
            /(?:_authToken|token)=/i.test(url.search)
        ) {
            errors.push(`${packagePath || "root"} embeds registry credentials`);
        }
        if (url.protocol !== "https:") {
            errors.push(
                `${packagePath || "root"} does not use HTTPS: ${resolved}`,
            );
        }
    }

    return [...new Set(errors)];
}

function main() {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const errors = validateLockfile(lock, packageJson);
    const npmrc = fs.existsSync(npmrcPath)
        ? fs.readFileSync(npmrcPath, "utf8")
        : "";
    if (!/^registry=https:\/\/registry\.npmjs\.org\/$/m.test(npmrc)) {
        errors.push(".npmrc must pin https://registry.npmjs.org/");
    }
    if (!/^replace-registry-host=never$/m.test(npmrc)) {
        errors.push(".npmrc must set replace-registry-host=never");
    }
    if (/(?:_authToken|_auth|password)\s*=/i.test(npmrc)) {
        errors.push(".npmrc must not contain registry credentials");
    }
    const regressionLock = JSON.parse(JSON.stringify(lock));
    const regressionEntry = Object.values(regressionLock.packages || {}).find(
        (entry) => entry && typeof entry.resolved === "string",
    );
    if (regressionEntry) {
        regressionEntry.resolved = regressionEntry.resolved.replace(
            "https://registry.npmjs.org/",
            "https://registry.internal.invalid/",
        );
        const regressionErrors = validateLockfile(regressionLock, packageJson);
        if (
            !regressionErrors.some((error) =>
                error.includes("non-portable host"),
            )
        ) {
            errors.push(
                "lockfile validator regression: a private registry host was not detected",
            );
        }
    }
    if (errors.length) {
        console.error("Lockfile portability check failed:\n");
        for (const error of errors) console.error(`- ${error}`);
        process.exit(1);
    }
    console.log(
        `Lockfile portability check passed: ${collectResolvedEntries(lock).length} package artifacts use registry.npmjs.org over HTTPS.`,
    );
}

if (require.main === module) main();

module.exports = { collectResolvedEntries, validateLockfile };
