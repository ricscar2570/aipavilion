#!/usr/bin/env node
"use strict";

const path = require("path");
const modulePath = path.resolve(
    __dirname,
    "../../backend/lambda/quota-reconciliation/index.js",
);
const { reconcile } = require(modulePath);

const apply = process.argv.includes("--apply");
reconcile({ apply })
    .then((report) => {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        if (report.errors.length) {
            process.exitCode = 2;
        } else if (report.conflicts.length) {
            process.exitCode = 3;
        } else if (!apply && report.drift.length) {
            process.exitCode = 4;
        }
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
