#!/usr/bin/env node
/**
 * Capture the README screenshots (docs/images/*.png) from a signed-in session.
 *
 * 1. Put your credentials in e2e/.env.development (copy the example).
 * 2. Run the auth setup once:  pnpm exec playwright test --project=setup-chromium
 * 3. pnpm screenshots [--org <org-key>] [--host http://localhost:3000]
 *
 * Uses the storage state saved by e2e/auth.setup.ts, so no credentials pass
 * through this script.
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

await page.goto(host, { waitUntil: "networkidle" });
await page.waitForURL((u) => /\/platform\/[^/]+/.test(u.pathname), { timeout: 60_000 });
const org = opt("--org", decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)[1]));
const base = `${host}/platform/${encodeURIComponent(org)}`;
fs.mkdirSync("docs/images", { recursive: true });

const shots = [
  ["home", ""],
  ["funnel", "/dashboard"],
  ["applications-board", "/applications"],
  ["prospects", "/prospects"],
  ["landing-pages", "/landing-pages"],
  ["settings-chief-of-staff", "/settings"],
];
for (const [name, route] of shots) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join("docs/images", `${name}.png`) });
  console.log(`saved docs/images/${name}.png`);
}

// A prospect page: the first row of the Prospects table.
await page.goto(`${base}/prospects`, { waitUntil: "networkidle" });
const firstRow = page.getByRole("row").nth(1);
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForURL((u) => /\/prospects\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/images/prospect.png" });
  console.log("saved docs/images/prospect.png");
}
await browser.close();
