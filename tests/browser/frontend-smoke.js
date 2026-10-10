"use strict";

// This exercises the actual production bundle, with API traffic stubbed.
// Cognito authentication and deployed CSP remain separate AWS evidence gates.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
    const root = path.resolve(__dirname, "../../dist");
    assert.ok(
        fs.existsSync(path.join(root, "index.html")),
        "Run npm run build first",
    );
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        let file = path.join(root, pathname);
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            file = path.join(root, "index.html");
        }
        response.setHeader(
            "Content-Type",
            {
                ".html": "text/html",
                ".js": "text/javascript",
                ".css": "text/css",
                ".svg": "image/svg+xml",
            }[path.extname(file)] || "application/octet-stream",
        );
        response.end(fs.readFileSync(file));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
        browser = await chromium.launch({
            executablePath: process.env.CHROMIUM_PATH || undefined,
            headless: true,
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) => {
            if (["fetch", "xhr"].includes(route.request().resourceType())) {
                return route.fulfill({
                    json: { stands: [], events: [], items: [], total: 0 },
                });
            }
            return route.continue();
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        for (const viewport of [
            { width: 1365, height: 900 },
            { width: 390, height: 844 },
        ]) {
            await page.setViewportSize(viewport);
            await page.goto(origin, { waitUntil: "networkidle" });
            assert.deepEqual(
                errors,
                [],
                "Bundle must initialize without JavaScript errors",
            );
            await page.locator("body.loaded").waitFor();
            await page.locator("#main-content h1").waitFor();
            assert.equal(
                await page
                    .locator("nav")
                    .evaluate((node) => getComputedStyle(node).position),
                "fixed",
                "Tailwind styles must load",
            );
            assert.equal(
                await page.evaluate(
                    () => document.documentElement.scrollWidth > innerWidth,
                ),
                false,
                "No horizontal overflow",
            );
            await page.locator("#auth-btn").click();
            await page.locator("#auth-email").waitFor({ state: "visible" });
            await page.locator("#auth-password").fill("local-browser-fixture");
            await page.locator("#auth-modal-close").click();
            await page.locator("#auth-modal").waitFor({ state: "hidden" });
            await page.goto(`${origin}/#/search`);
            await page.locator("#searchInput").fill("expo");
            await page.locator("#searchBtn").click();
            await page.getByText('No stands found for "expo"').waitFor();
            assert.deepEqual(
                errors,
                [],
                "Interactive routes must remain usable",
            );
        }
        const placeholder = await page.request.get(
            `${origin}/stand-placeholder.svg`,
        );
        assert.match(placeholder.headers()["content-type"], /image\/svg/);
        assert.match(await placeholder.text(), /<svg/);
        console.log(
            "Frontend bundle smoke passed: desktop/mobile startup, CSS, login modal, search and public asset.",
        );
    } finally {
        if (browser) {
            await browser.close();
        }
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
