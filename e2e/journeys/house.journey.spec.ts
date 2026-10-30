import { test, expect, type Page } from "@playwright/test";

/**
 * House journey — the first-run paths of an ibl.ai official app
 * (/iblai-vibe-house-journeys), the SIS's H1–H16: a user whose only
 * organization is the community one (H1–H2, H12–H14), a visitor on one they do
 * not belong to (H3–H4, H9), an admin's first run (H5–H6, H10–H11), a member's
 * (H7–H8), the session a $0 checkout returns to (H15) and the credit menu's
 * checkout (H16). Organization-wide state is served with page.route and never
 * written; the accounts' own metadata writes are answered by the route too, so
 * they stay fresh. The member checkpoints skip until pnpm e2e:accounts has
 * created the member account.
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";
const MAIN = process.env.NEXT_PUBLIC_MAIN_TENANT_KEY || "main";
const APP = process.env.NEXT_PUBLIC_IBL_PLATFORM || "mentor";
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://recruit.iblai.me").replace(/\/+$/, "");
const stamp = Date.now().toString(36);
// Answers a navigation the test only inspects; a 204 never commits, and a click waits for it.
const stub = { contentType: "text/html", body: "<title>stub</title>" };
const noMember = !process.env.PLAYWRIGHT_MEMBER_USERNAME || !process.env.PLAYWRIGHT_MEMBER_PASSWORD;
const NO_MEMBER = "no member pair in e2e/.env.development: pnpm e2e:accounts creates one";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const at = (org: string) => `/platform/${esc(encodeURIComponent(org))}`;
const home = (org: string) => new RegExp(`${at(org)}/?(\\?|#|$)`);
const onboarding = (org: string) => new RegExp(`${at(org)}/onboarding(/|\\?|#|$)`);
const platformUrl = (org: string, path = "") =>
  `${appHost}/platform/${encodeURIComponent(org)}${path}`;

/** The organization the session lands on: the segment after /platform/. */
async function landedOrg(page: Page): Promise<string> {
  await page.goto(`${appHost}/`);
  await page.waitForURL(/\/platform\/[^/?#]+/, { timeout: 30_000 });
  return decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
}

/** web-utils reads an organization's metadata from the membership list: serve `edit` there too. */
async function editListedMetadata(
  page: Page,
  edit: (metadata: Record<string, unknown>) => Record<string, unknown>,
) {
  await page.route(/\/api\/core\/users\/platforms\//, async (route) => {
    const res = await route.fetch();
    const all = (await res.json()) as { key: string; metadata?: Record<string, unknown> }[];
    await route.fulfill({
      response: res,
      json: all.map((p) => (p.key === MAIN ? p : { ...p, metadata: edit(p.metadata ?? {}) })),
    });
  });
}

// An organization answer still in flight when a test ends must not fail the next one.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** The member's session, saved per browser by auth.setup.ts. */
const memberState = async (
  { browserName }: { browserName: string },
  use: (state: string) => Promise<void>,
) => {
  await use(`playwright/.auth/member-setup-${browserName}.json`);
};

test.describe("a user whose only organization is the community one", () => {
  test.skip(noMember, NO_MEMBER);
  test.use({ storageState: memberState });
  // The member's session, told it belongs to the community organization only —
  // in storage and by the membership lists, which the SDK re-reads on every load.
  test.beforeEach(async ({ page }) => {
    const entry = {
      key: MAIN,
      org: MAIN,
      platform_name: "ibl.ai",
      is_admin: false,
      show_paywall: true,
    };
    await page.route(/\/api\/ibl\/users\/manage\/platform\//, (route) =>
      route.fulfill({ json: [entry] }),
    );
    await page.route(/\/api\/core\/users\/platforms\//, async (route) => {
      const res = await route.fetch();
      const all = (await res.json()) as { key: string }[];
      await route.fulfill({ response: res, json: all.filter((p) => p.key === MAIN) });
    });
    await page.addInitScript((only: typeof entry) => {
      localStorage.setItem("tenants", JSON.stringify([only]));
      localStorage.setItem("tenant", only.key);
      localStorage.setItem("current_tenant", JSON.stringify(only));
    }, entry);
  });

  test("H1 · lands on the community platform inside the shell, with the admin cluster shown", async ({
    page,
  }) => {
    await page.goto(`${appHost}/`);
    await expect(page).toHaveURL(home(MAIN), { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Management" })).toBeVisible({ timeout: 30_000 });
  });

  test("H12 · the community platform shows the sample: the admin rows, a filled Prospects list and the notice", async ({
    page,
  }) => {
    await page.goto(platformUrl(MAIN, "/prospects"));
    await expect(page.getByTestId("sample-notice")).toContainText("sample data", {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { level: 1, name: /^Prospects\b/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Ada Lovelace").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("H13 · a write on the sample opens the upgrade dialog", async ({ page }) => {
    await page.goto(platformUrl(MAIN, "/prospects?new=1"));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await dialog.getByLabel(/^name/i).fill("E2E Sample Visitor");
    await dialog.getByRole("button", { name: /create|save|add prospect/i }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "Upgrade for free" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("H14 · the upgrade dialog's Upgrade for free opens this app's $0 checkout", async ({
    page,
  }) => {
    let checkout = "";
    await page.route(/credits-free-plan/, (route) => {
      checkout = route.request().url();
      return route.fulfill(stub);
    });
    await page.goto(platformUrl(MAIN));
    await page
      .getByTestId("sample-notice")
      .getByRole("button", { name: "Create Your Platform" })
      .click({ timeout: 30_000 });
    await page.getByRole("dialog").getByRole("button", { name: "Upgrade for free" }).click();
    await expect
      .poll(() => checkout)
      .toContain("/api/service/stripe/checkout/redirect/credits-free-plan/");
    const back = new URL(new URL(checkout).searchParams.get("redirect_url") ?? "");
    expect(back.searchParams.get("app")).toBe(APP);
    expect(back.searchParams.get("redirect-to")).toBe(appUrl);
  });

  test("H2 · a trial-gated click opens the SDK upgrade dialog, and Escape closes it", async ({
    page,
  }) => {
    await page.goto(platformUrl(MAIN));
    await page.getByRole("button", { name: "Management" }).click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Upgrade for free", { timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("a visitor on an organization they do not belong to", () => {
  test.skip(noMember, NO_MEMBER);
  test.use({ storageState: memberState });
  const stranger = `e2e-nowhere-${stamp}`;

  test("H3 · the platform is previewed, and Join goes to the auth page's join for it", async ({
    page,
  }) => {
    let joinUrl = "";
    await page.route(/\/join\?tenant=/, (route) => {
      joinUrl = route.request().url();
      return route.fulfill(stub);
    });
    await page.goto(platformUrl(stranger));
    const preview = page.getByTestId("organization-preview");
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText(stranger);
    await preview.getByRole("button", { name: `Join ${stranger}` }).click();
    await expect.poll(() => joinUrl).toContain(`tenant=${stranger}`);
    expect(new URL(joinUrl).searchParams.get("redirect-to")).toContain(`/platform/${stranger}`);
  });

  test("H4 · Create Your Own Platform is ibl.ai's $0 sign-up with this app nested in the return address", async ({
    page,
  }) => {
    let checkout = "";
    await page.route(/credits-free-plan/, (route) => {
      checkout = route.request().url();
      return route.fulfill(stub);
    });
    await page.goto(platformUrl(stranger));
    await page
      .getByTestId("organization-preview")
      .getByRole("button", { name: "Create Your Own Platform" })
      .click({ timeout: 30_000 });
    await expect
      .poll(() => checkout)
      .toContain("/api/service/stripe/checkout/redirect/credits-free-plan/");
    const back = new URL(new URL(checkout).searchParams.get("redirect_url") ?? "");
    expect(back.searchParams.get("redirect-to")).toBe(appUrl);
  });

  test("H9 · Back to My Platform leaves the preview for the user's own platform home", async ({
    page,
  }) => {
    await page.goto(platformUrl(stranger));
    await page
      .getByTestId("organization-preview")
      .getByRole("link", { name: "Back to My Platform" })
      .click({ timeout: 30_000 });
    await page.waitForURL(
      (url) => /\/platform\/[^/?#]+/.test(url.pathname) && !url.pathname.includes(stranger),
      { timeout: 30_000 },
    );
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("organization-preview")).toHaveCount(0);
  });
});

test.describe("an admin's first run", () => {
  test("H5 · a readably keyed platform is not asked its name: the first run is sector, team, done, and the home holds afterwards", async ({
    page,
  }) => {
    // The admin's record: never completed on read, every write kept here.
    const records: Record<string, unknown>[] = [];
    await page.route(/\/api\/core\/users\/platform-metadata\//, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { username: "", platform_key: "", metadata: {} } });
      }
      const sent = route.request().postDataJSON() as { metadata?: Record<string, unknown> };
      records.push(sent.metadata ?? {});
      return route.fulfill({
        json: { username: "", platform_key: "", metadata: sent.metadata ?? {} },
      });
    });
    // The organization's metadata read without its sector; a write stays here.
    const sectors: unknown[] = [];
    await page.route(/\/api\/core\/orgs\/[^/]+\/metadata\//, async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        const res = await route.fetch();
        const body = (await res.json()) as { metadata?: Record<string, unknown> };
        const { sector: _unset, ...rest } = body.metadata ?? {};
        return route.fulfill({ response: res, json: { ...body, metadata: rest } });
      }
      const sent = req.postDataJSON() as { metadata?: { sector?: unknown } };
      sectors.push(sent.metadata?.sector);
      return route.fulfill({ json: { metadata: sent.metadata ?? {} } });
    });
    await editListedMetadata(page, ({ sector: _unset, ...rest }) => rest);
    const renames: unknown[] = [];
    await page.route(/\/api\/core\/platform\/$/, (route) => {
      renames.push(route.request().postDataJSON());
      return route.fulfill({ json: {} });
    });

    const org = await landedOrg(page);
    await expect(page).toHaveURL(onboarding(org), { timeout: 30_000 });
    await expect(page.getByRole("progressbar")).toBeVisible({ timeout: 30_000 });
    // The key is readable, so the name is known and the sector opens the flow.
    await expect(page.getByLabel("Organization name")).toHaveCount(0);
    await page.getByRole("radio", { name: "Higher Education" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    // The route announcer repeats the step's heading: ask for the heading itself.
    await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
    await page.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();
    await expect(page.getByTestId("onboarding-final-step")).toContainText("All Set", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Complete" }).click();
    await expect(page).toHaveURL(home(org), { timeout: 30_000 });
    // The record read still says "not completed": the home holds anyway.
    await page.waitForTimeout(5_000);
    await expect(page).toHaveURL(home(org));
    await expect(page.getByTestId("onboarding-page")).toHaveCount(0);
    expect(renames).toEqual([]);
    expect(sectors).toEqual(["higher_education"]);
    expect(records.at(-1)).toMatchObject({
      onboarding: { completed: true, sector: "higher_education", version: 1 },
    });
  });

  test("H6 · an admin who finished it stays home", async ({ page }) => {
    await page.route(/\/api\/core\/users\/platform-metadata\//, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            json: { username: "", platform_key: "", metadata: { onboarding: { completed: true } } },
          })
        : route.continue(),
    );
    const org = await landedOrg(page);
    await expect(page).toHaveURL(home(org), { timeout: 30_000 });
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("onboarding-page")).toHaveCount(0);
  });

  test("H11 · a named platform whose sector is set gets only the team step and the finish", async ({
    page,
  }) => {
    await page.route(/\/api\/core\/orgs\/[^/]+\/metadata\//, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const res = await route.fetch();
      const body = (await res.json()) as { metadata?: Record<string, unknown> };
      return route.fulfill({
        response: res,
        json: { ...body, metadata: { ...body.metadata, sector: "k12" } },
      });
    });
    const org = await landedOrg(page);
    await page.goto(platformUrl(org, "/onboarding?flow=admin"));
    await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-label", "Step 1 of 2");
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  });

  test("H10 · Management › Onboarding opens for the admin, its agent links based on this app's onboarding route", async ({
    page,
  }) => {
    const org = await landedOrg(page);
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Management", exact: true }).click();
    const management = page.getByRole("dialog").filter({ hasText: "Management" }).first();
    await management
      .getByRole("tab", { name: "Onboarding" })
      .or(management.getByRole("button", { name: "Onboarding", exact: true }))
      .first()
      .click();
    // The copyable link shows once an agent is picked; until then the tab says so.
    const link = management.locator("code").filter({ hasText: "/onboarding/" }).first();
    const empty = management.getByText("No onboarding agent yet");
    await expect(link.or(empty).first()).toBeVisible({ timeout: 30_000 });
    if (await link.isVisible()) {
      expect(await link.textContent()).toMatch(
        new RegExp(`^${esc(appHost)}/platform/${esc(encodeURIComponent(org))}/onboarding/`),
      );
    } else {
      test.info().annotations.push({
        type: "note",
        description: "no onboarding agent picked on this organization: the link base is not shown",
      });
    }
    await page.keyboard.press("Escape");
  });
});

test.describe("a member's first run", () => {
  test.skip(noMember, NO_MEMBER);
  test.use({ storageState: memberState });

  test("H7 · a member is sent to the platform's form, answers it, sees the final step and lands home", async ({
    page,
  }) => {
    const form = {
      version: 1,
      enabled: true,
      title: "Welcome",
      sections: [
        {
          key: "about",
          title: "About you",
          fields: [{ key: "role", type: "text", label: "Your role", required: true }],
        },
      ],
      agents: [],
    };
    // The organization's metadata, with the form added on every read and the
    // member's answers kept once written — nothing reaches the platform.
    let written: Record<string, unknown> = {};
    await page.route(/\/api\/core\/orgs\/[^/]+\/metadata\//, async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        const res = await route.fetch();
        const body = (await res.json()) as { metadata?: Record<string, unknown> };
        return route.fulfill({
          response: res,
          json: { ...body, metadata: { ...body.metadata, ...written, user_onboarding_form: form } },
        });
      }
      const sent = req.postDataJSON() as { metadata?: Record<string, unknown> } | null;
      written = sent?.metadata ?? sent ?? {};
      return route.fulfill({ json: { metadata: written } });
    });
    await editListedMetadata(page, (metadata) => ({
      ...metadata,
      ...written,
      user_onboarding_form: form,
    }));
    const org = await landedOrg(page);
    await expect(page).toHaveURL(onboarding(org), { timeout: 30_000 });
    await page.getByLabel("Your role").fill("Counselor");
    await page.getByRole("button", { name: /^(Submit|Continue)$/ }).click();
    await expect(page.getByTestId("onboarding-final-step")).toContainText("All Set", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(home(org), { timeout: 30_000 });
  });

  test("H8 · with nothing configured, /onboarding says so and Continue goes home", async ({
    page,
  }) => {
    const org = await landedOrg(page);
    await page.goto(platformUrl(org, "/onboarding"));
    const empty = page.getByTestId("user-onboarding-empty");
    await expect(empty).toBeVisible({ timeout: 30_000 });
    await empty.getByRole("button").click();
    await expect(page).toHaveURL(home(org), { timeout: 30_000 });
  });
});

test.describe("the session a $0 checkout returns to", () => {
  test("H15 · still on the community platform while the platform lists their own, the SDK moves them to it", async ({
    page,
  }) => {
    await page.route(/\/login\/complete\?/, (route) => route.fulfill(stub));
    const own = await landedOrg(page);
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
    await page.goto(`${appHost}/`);
    await page.waitForURL(/\/login\/complete\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("tenant")).toBe(own);
  });
});

test.describe("the credit menu's checkout", () => {
  test("H16 · Upgrade Plan asks for a pricing page that returns through the sign-in app", async ({
    page,
  }) => {
    let session = "";
    // The admin's organization behind the paywall, on a free trial: the badge offers Upgrade Plan.
    await page.route(/\/api\/core\/users\/platforms\//, async (route) => {
      const res = await route.fetch();
      const all = (await res.json()) as { key: string }[];
      await route.fulfill({
        response: res,
        json: all.map((p) => (p.key === MAIN ? p : { ...p, show_paywall: true })),
      });
    });
    await page.route(/\/api\/billing\/account\//, (route) =>
      route.fulfill({
        json: {
          platform_key: new URL(route.request().url()).searchParams.get("platform_key"),
          available_credits: 100,
          has_credits: true,
          current_plan: "Free Trial",
          free_trial: true,
        },
      }),
    );
    // Answered like the platform answers a refused return, so nothing navigates.
    await page.route(/\/stripe\/pricing-page-session\//, (route) => {
      session = route.request().url();
      return route.fulfill({ status: 400, json: { redirect_url: "stubbed" } });
    });
    const own = await landedOrg(page);
    // The badge reads the stored membership this first load wrote.
    await page.goto(platformUrl(own));
    await page.getByRole("button", { name: /credits remaining/i }).click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Upgrade Plan" }).click();
    await expect.poll(() => session).toContain("/stripe/pricing-page-session/");
    const back = new URL(new URL(session).searchParams.get("redirect_url") ?? "");
    expect(back.searchParams.get("app")).toBe(APP);
    expect(back.searchParams.get("redirect-to")).toBe(appUrl);
  });
});
