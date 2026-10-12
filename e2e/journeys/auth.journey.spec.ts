import { test, expect } from "@playwright/test";

/**
 * Auth journey — the multi-organization sign-in round trip.
 * Requires auth.setup.ts (pre-authenticated storage state).
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";

test.describe("auth journey", () => {
  test("A1 · an authenticated user lands on their organization's home", async ({ page }) => {
    await page.goto(appHost);
    await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 30_000 });
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
});
