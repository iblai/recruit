import { test, expect } from "@playwright/test";

/**
 * Shell journey — sidebar navigation, ⌘K, the organization switcher, and the
 * admin gate. Requires auth.setup.ts.
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";

async function gotoHome(page: import("@playwright/test").Page) {
  await page.goto(appHost);
  await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
  return decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)![1]);
}

test.describe("shell journey", () => {
  test("S1 · the sidebar reaches every workspace object", async ({ page }) => {
    const org = await gotoHome(page);
    for (const [label, path, heading] of [
      ["Funnel", "dashboard", "Funnel"],
      ["Prospects", "prospects", "Prospects"],
      ["Schools", "schools", "Schools & partners"],
      ["Applications", "applications", "Applications"],
      ["Activities", "activities", "Activities"],
      ["Pages", "landing-pages", "Landing pages"],
      ["Tags", "tags", "Tags"],
    ] as const) {
      await page.getByRole("link", { name: label, exact: true }).first().click();
      await page.waitForURL(
        (url) => url.pathname.endsWith(`/platform/${encodeURIComponent(org)}/${path}`),
        {
          timeout: 15_000,
        },
      );
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("S2 · ⌘K opens the command palette with quick actions", async ({ page }) => {
    await gotoHome(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await expect(page.getByPlaceholder(/search prospects, schools, applications/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("New prospect")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("S3 · the OS footer cluster is present in the sidebar", async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByRole("link", { name: /support/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /notifications/i }).first()).toBeVisible();
  });

  test("S4 · a member (or an admin in User mode) never sees Settings", async ({ page }) => {
    const org = await gotoHome(page);
    const isAdmin = await page.evaluate((key) => {
      try {
        return !!JSON.parse(localStorage.getItem("tenants") ?? "[]").find((t: any) => t.key === key)
          ?.is_admin;
      } catch {
        return false;
      }
    }, org);
    if (isAdmin) {
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("switch", { name: /admin mode/i }).click();
    }
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto(`${appHost}/platform/${encodeURIComponent(org)}/settings`);
    await page.waitForURL(
      (url) =>
        url.pathname === `/platform/${encodeURIComponent(org)}` ||
        url.pathname === `/platform/${encodeURIComponent(org)}/`,
      {
        timeout: 15_000,
      },
    );
  });
});
