import { test as setup, expect, type Page } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({
  path: path.resolve(__dirname, ".env.development"),
});

const APP_HOST = process.env.APP_HOST || "http://localhost:3000";
const AUTH_DIR = "playwright/.auth";

/** Sign in through the real Auth SPA and save the session as `<prefix>-<setup project>.json`. */
async function signIn(page: Page, username: string, password: string, prefix: string) {
  // Navigate to the app — AuthProvider will redirect to the auth SPA
  await page.goto(APP_HOST, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait for the auth SPA login page. The app identifier (`app=custom` for
  // vibe-starter; `app=mentor` for the OS) is not asserted — only the SPA's
  // /login route, so a rebranded app keeps this setup working.
  await page.waitForURL((url) => url.href.includes("/login") && url.href.includes("redirect-to="), {
    timeout: 60_000,
  });

  // Click "Continue with Password" to reveal the password fields
  const continueWithPassword = page.getByRole("button", { name: /continue with password/i });
  await expect(continueWithPassword).toBeVisible({ timeout: 30_000 });
  await continueWithPassword.click();

  // Fill in credentials
  await page.getByRole("textbox", { name: /email/i }).fill(username);
  await page.getByRole("textbox", { name: /password/i }).fill(password);

  // Submit
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Wait for redirect back to the app
  await page.waitForURL((url) => url.href.startsWith(APP_HOST), { timeout: 60_000 });

  // Wait for auth tokens to be stored in localStorage
  await page.waitForFunction(() => !!window.localStorage.getItem("axd_token"), {
    timeout: 30_000,
  });

  // Save storage state keyed by project name (e.g., setup-chromium, setup-firefox, setup-webkit)
  const projectName = setup.info().project.name; // e.g. "setup-chromium"
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: `${AUTH_DIR}/${prefix}-${projectName}.json` });
}

setup("authenticate", async ({ page }) => {
  setup.setTimeout(180_000);

  const username = process.env.PLAYWRIGHT_USERNAME || "";
  const password = process.env.PLAYWRIGHT_PASSWORD || "";

  if (!username || !password) {
    throw new Error(
      "PLAYWRIGHT_USERNAME and PLAYWRIGHT_PASSWORD must be set in e2e/.env.development (pnpm e2e:accounts)",
    );
  }

  await signIn(page, username, password, "user");

  // The admin's first run is the SDK setup flow: walk it once, so every
  // journey lands home from here on. It asks only what the organization lacks.
  await page.waitForURL(/\/platform\/[^/?#]+/, { timeout: 60_000 });
  const orgName = page.getByLabel("Organization name");
  const sector = page.getByRole("radio", { name: "Higher Education" });
  const invite = page.getByRole("heading", { name: "Invite your team" });
  const home = page.getByRole("heading", { name: "Chief of Staff" });
  await expect(orgName.or(sector).or(invite).or(home).first()).toBeVisible({ timeout: 60_000 });
  if (await home.isVisible()) return;
  if (await orgName.isVisible()) {
    await orgName.fill("E2E Recruit");
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(sector.or(invite).first()).toBeVisible({ timeout: 30_000 });
  if (await sector.isVisible()) {
    await sector.click();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(invite).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();
  await page.getByRole("button", { name: "Complete" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/onboarding"), { timeout: 60_000 });
});

setup("authenticate the member", async ({ page }) => {
  const username = process.env.PLAYWRIGHT_MEMBER_USERNAME || "";
  const password = process.env.PLAYWRIGHT_MEMBER_PASSWORD || "";
  setup.skip(
    !username || !password,
    "no member pair in e2e/.env.development: pnpm e2e:accounts creates one",
  );
  setup.setTimeout(120_000);
  await signIn(page, username, password, "member");
});
