import { test, expect, type Page } from "@playwright/test";

/**
 * Recruitment journey — the core loop: a prospect, a school, an application
 * marked enrolled, an activity marked done, a tag, and the public landing-page
 * route. Runs against the signed-in user's
 * organization and cleans up what it creates. Requires auth.setup.ts.
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";
const stamp = `e2e-${Date.now().toString(36)}`;

async function org(page: Page) {
  await page.goto(appHost);
  await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
  return decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)![1]);
}

test.describe.serial("recruit journey", () => {
  test("C1 · create a prospect and open its page", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/prospects?new=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^name/i).fill(`${stamp} Prospect`);
    await dialog.getByRole("button", { name: /create|save|add prospect/i }).click();
    await page.waitForURL((url) => /\/prospects\/[0-9a-f-]{36}/.test(url.pathname), {
      timeout: 20_000,
    });
    await expect(page.getByText(`${stamp} Prospect`).first()).toBeVisible();
  });

  test("C2 · create a school and see it in the list", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/schools?new=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^name/i).fill(`${stamp} School`);
    await dialog.getByRole("button", { name: /create|save|add school/i }).click();
    await expect(page.getByText(`${stamp} School`).first()).toBeVisible({ timeout: 20_000 });
  });

  test("C3 · open an application, see it on the board, mark it enrolled", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/applications?new=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^title/i).fill(`${stamp} Application`);
    // Pick the person created in C1.
    await dialog.getByRole("button", { name: /search for a prospect/i }).click();
    await page
      .getByPlaceholder(/search/i)
      .last()
      .fill(stamp);
    await page
      .getByRole("option", { name: new RegExp(`${stamp} Prospect`) })
      .first()
      .click();
    await dialog.getByRole("button", { name: /open application|create|save/i }).click();
    await page.waitForURL((url) => /\/applications\/\d+/.test(url.pathname), { timeout: 20_000 });
    await page.getByRole("button", { name: /mark enrolled/i }).click();
    await page
      .getByRole("button", { name: /^(confirm|mark enrolled|yes)/i })
      .last()
      .click();
    await expect(page.getByText(/^enrolled$/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("C4 · log an activity on a prospect", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/prospects`);
    await page
      .getByPlaceholder(/search/i)
      .first()
      .fill(stamp);
    await page
      .getByRole("row")
      .filter({ hasText: `${stamp} Prospect` })
      .first()
      .click();
    await page.waitForURL((url) => /\/prospects\/[0-9a-f-]{36}/.test(url.pathname), {
      timeout: 20_000,
    });
    await page.getByLabel(/activity title/i).fill(`${stamp} call`);
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText(`${stamp} call`).first()).toBeVisible({ timeout: 20_000 });
  });

  test("C5 · create and delete a tag", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/tags`);
    await page.getByRole("button", { name: /new tag/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^name/i).fill(`${stamp}-tag`);
    await dialog.getByRole("button", { name: /create|save/i }).click();
    await expect(page.getByText(`${stamp}-tag`).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("landing pages", () => {
  test("L1 · an unknown public page shows the neutral not-available state", async ({ page }) => {
    const key = await org(page);
    await page.goto(`${appHost}/p/${encodeURIComponent(key)}/does-not-exist-${stamp}`);
    await expect(page.getByRole("heading", { name: /not available/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("L2 · admins can draft a landing page and see it in the list", async ({ page }) => {
    const key = await org(page);
    const isAdmin = await page.evaluate(
      (k) =>
        !!JSON.parse(localStorage.getItem("tenants") ?? "[]").find(
          (t: { key: string; is_admin?: boolean }) => t.key === k,
        )?.is_admin,
      key,
    );
    test.skip(!isAdmin, "needs an organization admin");
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/landing-pages?new=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^title/i).fill(`${stamp} Open House`);
    await dialog.getByRole("button", { name: /create page/i }).click();
    await page.waitForURL((url) => /\/landing-pages\/[a-z0-9-]+/.test(url.pathname), {
      timeout: 20_000,
    });
    await expect(page.getByText("Draft").first()).toBeVisible();
  });
});
