import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Sample journey — a user who belongs to no organization but the community one
 * browses recruit on its sample data: the notice, the sample's prospects,
 * schools, applications, activities and tags, and a write that opens the
 * upgrade dialog instead of reaching the platform. The signed-in session is
 * told it belongs to `main` alone, in storage and by the routed membership
 * lists. Nothing reaches the checkout: D5 answers it locally.
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";
const MAIN = process.env.NEXT_PUBLIC_MAIN_TENANT_KEY || "main";
const onMainUrl = (route = "") => `${appHost}/platform/${encodeURIComponent(MAIN)}${route}`;
/** The installed web-containers declares the upgrade dialog's `checkoutUrl` (iblai-web-frontend#2195). */
const sdkHasCheckoutUrl = fs
  .readFileSync(
    path.resolve(__dirname, "../../node_modules/@iblai/web-containers/dist/index.d.ts"),
    "utf8",
  )
  .includes("checkoutUrl");

/** The session, told it belongs to the community organization only, opened on it. */
async function onMain(page: Page, route = "") {
  const entry = { key: MAIN, org: MAIN, platform_name: "ibl.ai", is_admin: false };
  await page.route(/\/api\/ibl\/users\/manage\/platform\//, (r) => r.fulfill({ json: [entry] }));
  // The list newer web-utils reads: the user's real memberships, `main` alone kept.
  await page.route(/\/api\/core\/users\/platforms\//, async (r) => {
    const res = await r.fetch();
    const all = (await res.json()) as { key: string }[];
    await r.fulfill({ response: res, json: all.filter((p) => p.key === MAIN) });
  });
  await page.addInitScript((only: typeof entry) => {
    localStorage.setItem("tenants", JSON.stringify([only]));
    localStorage.setItem("tenant", only.key);
    localStorage.setItem("current_tenant", JSON.stringify(only));
  }, entry);
  await page.goto(onMainUrl(route));
  await expect(page.getByTestId("sample-notice")).toBeVisible({ timeout: 60_000 });
}

test.describe("sample journey", () => {
  test("D1 · the community organization carries the sample notice and the sample's applications", async ({
    page,
  }) => {
    await onMain(page, "/dashboard");
    await expect(page.getByTestId("sample-notice")).toContainText("sample data");
    await expect(
      page.getByTestId("sample-notice").getByRole("button", { name: "Create your organization" }),
    ).toBeVisible();
    await expect(page.locator("#main-content")).toContainText("Admitted", { timeout: 30_000 });
  });

  test("D2 · the sample's prospects are listed and a prospect's page opens", async ({ page }) => {
    await onMain(page, "/prospects");
    await page.getByText("Ada Lovelace").first().click();
    await page.waitForURL((url) => /\/prospects\/[0-9a-f-]{36}/.test(url.pathname), {
      timeout: 20_000,
    });
    await expect(page.locator("#main-content")).toContainText("Lincoln High School", {
      timeout: 20_000,
    });
  });

  test("D3 · schools, applications, activities and tags show the sample's rows", async ({
    page,
  }) => {
    await onMain(page);
    for (const [route, text] of [
      ["/schools", "Westbrook Community College"],
      ["/applications", "Priya Natarajan"],
      ["/activities", "Campus tour"],
      ["/tags", "First-gen"],
    ] as const) {
      await page.goto(onMainUrl(route));
      await expect(page.locator("#main-content")).toContainText(text, { timeout: 30_000 });
    }
  });

  test("D4 · creating a prospect opens the upgrade dialog and reaches no platform", async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (req) => {
      if (/\/dm\/api\/crm\//.test(req.url()) && req.method() !== "GET") writes.push(req.url());
    });
    await onMain(page, "/prospects?new=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^name/i).fill("E2E Sample Visitor");
    await dialog.getByRole("button", { name: /create|save|add prospect/i }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "Upgrade for free" })).toBeVisible({
      timeout: 15_000,
    });
    expect(writes).toEqual([]);
  });

  test("D5 · the upgrade dialog's Upgrade for free opens recruit's $0 checkout", async ({
    page,
  }) => {
    test.skip(
      !sdkHasCheckoutUrl,
      "web-containers lacks checkoutUrl: the release of iblai-web-frontend#2195",
    );
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://recruit.iblai.me").replace(
      /\/+$/,
      "",
    );
    let checkout = "";
    await page.route(/credits-free-plan/, (route) => {
      checkout = route.request().url();
      return route.fulfill({ status: 204, body: "" });
    });
    await onMain(page, "/dashboard");
    await page
      .getByTestId("sample-notice")
      .getByRole("button", { name: "Create your organization" })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Upgrade for free" }).click();
    await expect
      .poll(() => checkout)
      .toContain("/api/service/stripe/checkout/redirect/credits-free-plan/");
    const back = new URL(new URL(checkout).searchParams.get("redirect_url") ?? "");
    expect(back.searchParams.get("app")).toBe("mentor");
    expect(back.searchParams.get("redirect-to")).toBe(appUrl);
  });
});
