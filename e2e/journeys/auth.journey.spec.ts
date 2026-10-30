import { test, expect } from "@playwright/test";

/**
 * Auth journey — the multi-organization sign-in round trip.
 * Requires auth.setup.ts (pre-authenticated storage state).
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";
const MAIN = process.env.NEXT_PUBLIC_MAIN_TENANT_KEY || "main";
// Answers a navigation the test only inspects; a 204 never commits, and a click waits for it.
const stub = { contentType: "text/html", body: "<title>stub</title>" };

test.describe("auth journey", () => {
  test("A1 · an authenticated user lands on their organization's home", async ({ page }) => {
    await page.goto(appHost);
    await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Chief of Staff" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("A2 · auth tokens and the organization list are stored in localStorage", async ({
    page,
  }) => {
    await page.goto(appHost);
    await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
    const state = await page.evaluate(() => ({
      axd: !!localStorage.getItem("axd_token"),
      dm: !!localStorage.getItem("dm_token"),
      tenants: JSON.parse(localStorage.getItem("tenants") ?? "[]").length,
    }));
    expect(state.axd).toBe(true);
    expect(state.dm).toBe(true);
    expect(state.tenants).toBeGreaterThan(0);
  });

  test("A3 · the URL's organization matches the session's organization", async ({ page }) => {
    await page.goto(appHost);
    await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
    const fromUrl = decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)![1]);
    const fromSession = await page.evaluate(() => {
      const raw = localStorage.getItem("current_tenant") ?? "";
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "string" ? parsed : parsed?.key;
      } catch {
        return raw || localStorage.getItem("tenant");
      }
    });
    expect(fromUrl).toBe(fromSession);
  });

  test("A4 · back from the $0 checkout on the community organization's session, the SDK moves the user to their own", async ({
    page,
  }) => {
    await page.route(/\/login\/complete\?/, (route) => route.fulfill(stub));
    await page.goto(appHost);
    await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
    const own = decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)![1]);
    const keys = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem("tenants") ?? "[]") as { key: string }[]).map((t) => t.key),
    );
    // The SDK's two-organization rule: a user holding exactly [main, X] is moved to X.
    expect(keys.sort()).toEqual([MAIN, own].sort());
    await page.evaluate((main) => {
      const entry = { key: main, org: main, platform_name: "ibl.ai", is_admin: false };
      localStorage.setItem("tenant", main);
      localStorage.setItem("current_tenant", JSON.stringify(entry));
      localStorage.setItem("tenants", JSON.stringify([entry]));
    }, MAIN);
    await page.goto(appHost);
    await page.waitForURL(/\/login\/complete\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("tenant")).toBe(own);
  });
});
