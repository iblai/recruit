#!/usr/bin/env node
/**
 * Capture the README screenshots (docs/images/*.png) from a signed-in session.
 *
 * 1. Put your credentials in e2e/.env.development (copy the example).
 * 2. Run the auth setup once:  pnpm exec playwright test --project=setup-chromium
 * 3. pnpm screenshots [--org <org-key>] [--host http://localhost:3000] [--page <landing slug>]
 *
 * Uses the storage state saved by e2e/auth.setup.ts, so no credentials pass
 * through this script. Seed an organization first (`pnpm seed:demo`) so the
 * captures have something to show.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const host = opt("--host", process.env.APP_HOST || "http://localhost:3000");
const stateFile = opt("--state", "playwright/.auth/user-setup-chromium.json");
const landingSlug = opt("--page", "request-information");
if (!fs.existsSync(stateFile)) {
  console.error(
    `No saved session at ${stateFile}. Run: pnpm exec playwright test --project=setup-chromium`,
  );
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: stateFile,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const out = (name) => path.join("docs/images", `${name}.png`);
// The SDK providers verify the session before any page renders; wait for the
// loading screen to leave, then for the network to settle.
const settle = async (ms = 1800) => {
  await page
    .locator('output[aria-label="Loading"]')
    .first()
    .waitFor({ state: "detached", timeout: 45_000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  // The org's branding (name, logo) arrives with the metadata query; do not
  // capture while the breadcrumb still shows a raw organization key.
  await page
    .locator("header a", { hasText: /^[0-9a-f]{20,}/ })
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
};
const shoot = async (name, fullPage = false) => {
  // Drop the Next.js dev indicator so captures look like production.
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove()).catch(() => {});
  await page.screenshot({ path: out(name), fullPage });
  console.log(`saved ${out(name)}`);
  // Be gentle with the platform's per-user rate limit between pages.
  await page.waitForTimeout(2500);
};

await page.goto(host, { waitUntil: "networkidle" });
await page.waitForURL((u) => /\/platform\/[^/]+/.test(u.pathname), { timeout: 60_000 });
const org = opt("--org", decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)[1]));
const base = `${host}/platform/${encodeURIComponent(org)}`;
fs.mkdirSync("docs/images", { recursive: true });

// Simple routes.
for (const [name, route] of [
  ["home", ""],
  ["funnel", "/dashboard"],
  ["prospects", "/prospects"],
  ["schools", "/schools"],
  ["applications-board", "/applications"],
  ["activities", "/activities"],
  ["landing-pages", "/landing-pages"],
  ["settings-chief-of-staff", "/settings"],
  ["settings-funnels", "/settings?tab=pipelines"],
  ["settings-branding", "/settings?tab=branding"],
]) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await settle();
  await shoot(name);
}

// Applications table view.
await page.goto(`${base}/applications`, { waitUntil: "networkidle" });
await settle();
const tableToggle = page
  .getByRole("radio", { name: /table view/i })
  .or(page.getByRole("button", { name: /table view/i }));
if (await tableToggle.count()) {
  await tableToggle.first().click();
  await settle(1200);
  await shoot("applications-table");
}

// A prospect page: the first row of the Prospects table.
await page.goto(`${base}/prospects`, { waitUntil: "networkidle" });
await settle();
const firstRow = page.getByRole("row").nth(1);
if (await firstRow.count()) {
  await firstRow.getByRole("cell").first().click();
  await page.waitForURL((u) => /\/prospects\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30_000 });
  await settle();
  await shoot("prospect");
}

// An application page: the first row of the Applications table.
await page.goto(`${base}/applications`, { waitUntil: "networkidle" });
await settle();
if (await tableToggle.count()) {
  await tableToggle.first().click();
  await settle(1200);
}
const firstAppRow = page.getByRole("row").nth(1);
if (await firstAppRow.count()) {
  await firstAppRow.getByRole("cell").first().click();
  await page.waitForURL((u) => /\/applications\/\d+/.test(u.pathname), { timeout: 30_000 });
  await settle();
  await shoot("application");
}

// The Chief of Staff side panel on a list page.
await page.goto(`${base}/prospects`, { waitUntil: "networkidle" });
await settle();
const panelButton = page.getByRole("button", { name: /chief of staff/i }).first();
if (await panelButton.count()) {
  await panelButton.click();
  await page
    .getByPlaceholder(/ask anything/i)
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await settle(2500);
  await shoot("assistant-panel");
  await page
    .getByRole("button", { name: /^close$/i })
    .first()
    .click()
    .catch(() => {});
  await settle(600);
}

// Landing-page editor + public page.
await page.goto(`${base}/landing-pages/${encodeURIComponent(landingSlug)}`, {
  waitUntil: "networkidle",
});
await settle();
await page
  .getByRole("tab", { name: /content/i })
  .waitFor({ timeout: 30_000 })
  .catch(() => {});
await settle(1200);
if (!/not available|no longer exists/i.test(await page.textContent("body"))) {
  await shoot("landing-page-editor");
}
await page.goto(`${host}/p/${encodeURIComponent(org)}/${encodeURIComponent(landingSlug)}`, {
  waitUntil: "networkidle",
});
await settle();
await shoot("landing-page-public");
await page.setViewportSize({ width: 414, height: 896 });
await page.goto(`${host}/p/${encodeURIComponent(org)}/${encodeURIComponent(landingSlug)}`, {
  waitUntil: "networkidle",
});
await settle();
await shoot("landing-page-mobile", true);

await browser.close();
