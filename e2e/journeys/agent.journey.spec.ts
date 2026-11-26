import { test, expect, type Page } from "@playwright/test";

/**
 * Agent journey — Recruit, the agent prospective students talk to, and what
 * the team sees of it. P1–P4 are what a visitor sees and need no session.
 * R1–R12 run as the signed-in user on their own organization and remove what
 * they create; R6 skips until Recruit is set up there. Requires auth.setup.ts.
 */
const appHost = process.env.APP_HOST || "http://localhost:3000";
const stamp = `e2e-${Date.now().toString(36)}`;

async function org(page: Page) {
  await page.goto(appHost);
  await page.waitForURL((url) => /\/platform\/[^/]+/.test(url.pathname), { timeout: 30_000 });
  return decodeURIComponent(page.url().match(/\/platform\/([^/?#]+)/)![1]);
}

const isAdminOf = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      !!JSON.parse(localStorage.getItem("tenants") ?? "[]").find(
        (t: { key: string; is_admin?: boolean }) => t.key === k,
      )?.is_admin,
    key,
  );

/**
 * The organization's CRM as the signed-in user, for records only an agent
 * leaves: the address and the Authorization of a request the app itself makes.
 */
async function crm(page: Page) {
  const seen = page.waitForRequest((r) => /\/api\/crm\/overview\//.test(r.url()), {
    timeout: 60_000,
  });
  const key = await org(page);
  const request = await seen;
  const base = request.url().split("/overview/")[0];
  const { authorization } = await request.allHeaders();
  const send = async (app: string, method: string, path: string, data?: object) => {
    const res = await page.request.fetch(
      app ? `${base}${path}${path.includes("?") ? "&" : "?"}app=${app}` : `${base}${path}`,
      {
        method,
        headers: { authorization },
        data,
      },
    );
    expect(res.ok(), `${method} ${path} → ${res.status()}`).toBe(true);
    return res.status() === 204 ? {} : ((await res.json()) as Record<string, unknown>);
  };
  const call = (method: string, path: string, data?: object) => send("recruit", method, path, data);
  /** The CRM app's own records: the same CRM, naming no app. */
  const crmApp = (method: string, path: string, data?: object) => send("", method, path, data);
  return { key, call, crmApp, authorization };
}

type Tagged = {
  id: string;
  unique_id?: string;
  app?: string;
  tags: { id: number; name: string }[];
};

/** A person by their exact `unique_id`: `search` is a substring match. */
async function byUniqueId(
  call: (m: string, p: string) => Promise<Record<string, unknown>>,
  uid: string,
) {
  const { results } = (await call("GET", `/persons/?search=${encodeURIComponent(uid)}`)) as {
    results: Tagged[];
  };
  return results.find((p) => p.unique_id === uid);
}

/** The tags of these names already in a CRM, so a journey removes only the ones it made. */
async function tagsNamed(
  call: (m: string, p: string) => Promise<Record<string, unknown>>,
  names: string[],
) {
  const out = new Map<string, number>();
  for (const name of names) {
    const { results } = (await call("GET", `/tags/?name__iexact=${encodeURIComponent(name)}`)) as {
      results: { id: number; name: string }[];
    };
    const hit = results.find((t) => t.name === name);
    if (hit) out.set(name, hit.id);
  }
  return out;
}

/** Remove the tags of these names that were not there before. */
async function removeNewTags(
  call: (m: string, p: string) => Promise<Record<string, unknown>>,
  names: string[],
  before: Map<string, number>,
) {
  for (const [name, id] of await tagsNamed(call, names))
    if (!before.has(name)) await call("DELETE", `/tags/${id}/`);
}

test.describe("what a visitor sees", () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: "fr-FR" });

  test("P1 · an event page shows its date and place in the visitor's language, with the chat on it", async ({
    page,
  }) => {
    await page.goto(`${appHost}/p/__sample__/open-house`);
    test.skip(
      await page.getByRole("heading", { name: /not available/i }).isVisible(),
      "the built-in sample page exists outside production builds only",
    );
    const event = page.getByTestId("event");
    await expect(event).toContainText(/samedi \d+ \S+ · \d/);
    await expect(event).toContainText("Simulation Lab, Harper Hall");
    // The chat is on the page, beside the form, and knows which page it is on.
    const chat = page.getByTestId("chat-frame");
    await expect(chat).toHaveAttribute("src", "/chat/__sample__?page=open-house&frame=page");
    await expect(chat).toHaveAttribute("title", "Posez une question");
    await expect(
      page.frameLocator('[data-testid="chat-frame"]').getByRole("heading", {
        name: "Ce chat n’est pas disponible",
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Save my seat" })).toBeVisible();
  });

  test("P3 · a page on an organization without Recruit carries no chat", async ({ page }) => {
    await page.goto(`${appHost}/p/__sample__/request-info`);
    test.skip(
      await page.getByRole("heading", { name: /not available/i }).isVisible(),
      "the built-in sample page exists outside production builds only",
    );
    await expect(page.getByRole("button", { name: /.+/ }).first()).toBeVisible();
    await expect(page.getByTestId("chat-frame")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("P4 · a taster course opens its first lesson, with the chat and the form on one edge at phone width", async ({
    page,
  }) => {
    await page.goto(`${appHost}/p/__sample__/taster-course`);
    test.skip(
      await page.getByRole("heading", { name: /not available/i }).isVisible(),
      "the built-in sample page exists outside production builds only",
    );
    const lessons = page.getByTestId("lessons").locator("details");
    await expect(lessons).toHaveCount(2);
    await expect(lessons.nth(0)).toHaveAttribute("open", "");
    await expect(lessons.nth(1)).not.toHaveAttribute("open");
    await lessons.nth(1).locator("summary").click();
    await expect(lessons.nth(1)).toHaveAttribute("open", "");
    await expect(page.getByTestId("chat-frame")).toHaveAttribute(
      "src",
      "/chat/__sample__?page=taster-course&frame=page",
    );
    await expect(page.getByRole("button", { name: "Request information" })).toBeVisible();
    // A phone: what is painted (lessons, chat, the form's card) starts and ends on one line, and nothing scrolls sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    const edges = await page.evaluate(() =>
      [
        document.querySelector('[data-testid="lessons"]'),
        document.querySelector('[data-testid="chat-frame"]'),
        document.querySelector("main > section:last-of-type > *"),
      ].map((el) => {
        const r = el!.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right)];
      }),
    );
    expect(new Set(edges.map(String)).size, JSON.stringify(edges)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test("P2 · an organization without Recruit gets the neutral chat page", async ({ page }) => {
    await page.goto(`${appHost}/chat/no-such-organization-${stamp}`);
    await expect(page.getByRole("heading", { name: "Ce chat n’est pas disponible" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("ai-notice")).toHaveCount(0);
  });
});

test.describe("agent journey", () => {
  test("R1 · the sidebar reaches Needs you, and in Admin mode Conversations, Scoreboard and Recruit", async ({
    page,
  }) => {
    const key = await org(page);
    const rows = [["Needs you", "needs-you"]];
    if (await isAdminOf(page, key))
      rows.push(
        ["Conversations", "conversations"],
        ["Scoreboard", "scoreboard"],
        ["Recruit", "recruit"],
      );
    for (const [label, path] of rows) {
      // "Needs you" carries its count in the link ("Needs you 2").
      await page
        .getByRole("link", { name: new RegExp(`^${label}( \\d+)?$`) })
        .first()
        .click();
      await page.waitForURL(
        (url) => url.pathname.endsWith(`/platform/${encodeURIComponent(key)}/${path}`),
        { timeout: 15_000 },
      );
      await expect(
        page.getByRole("heading", { level: 1, name: new RegExp(`^${label}( \\d+)?$`) }),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("R2 · outside Admin mode Recruit's admin rows are gone, and /recruit goes home", async ({
    page,
  }) => {
    const key = await org(page);
    if (await isAdminOf(page, key)) {
      await expect(page.getByRole("link", { name: "Recruit", exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("switch", { name: /admin mode/i }).click();
    }
    for (const label of ["Conversations", "Scoreboard", "Recruit"])
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Needs you( \d+)?$/ })).toBeVisible();
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/recruit`);
    await page.waitForURL(
      (url) => url.pathname.replace(/\/$/, "") === `/platform/${encodeURIComponent(key)}`,
      { timeout: 15_000 },
    );
  });

  test("R3 · an admin makes a landing page an event, publishes it, and a visitor sees the date", async ({
    page,
    browser,
  }) => {
    const { key, call } = await crm(page);
    test.skip(!(await isAdminOf(page, key)), "needs an organization admin");
    const funnels = (await call("GET", "/pipelines/")) as { results?: unknown[] };
    if (!funnels.results?.length) {
      // A new organization has no funnel, and a page routes into one: Applications offers it.
      await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/applications`);
      await page.getByRole("button", { name: "Set up admissions" }).click();
      await expect(page.getByRole("heading", { name: "No admissions funnel yet" })).toHaveCount(0, {
        timeout: 30_000,
      });
    }
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/landing-pages?new=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel(/^title/i).fill(`${stamp} Open House`);
    await dialog.getByRole("button", { name: /create page/i }).click();
    await page.waitForURL((url) => /\/landing-pages\/[a-z0-9-]+/.test(url.pathname), {
      timeout: 20_000,
    });
    const slug = new URL(page.url()).pathname.split("/landing-pages/")[1];
    try {
      // Base UI puts a switch's id on its hidden input: the switch itself is found by role.
      await page.getByRole("switch", { name: /^Event/ }).click();
      await expect(page.locator("#lp-event-startsAt")).not.toHaveValue("");
      await page.locator("#lp-event-place").fill("Simulation lab");
      await page.getByRole("switch", { name: "Published" }).click();
      await expect(page.getByText("Page is live")).toBeVisible({ timeout: 20_000 });

      const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const seen = await visitor.newPage();
      await seen.goto(`${appHost}/p/${encodeURIComponent(key)}/${slug}`);
      await expect(seen.getByTestId("event")).toContainText("Simulation lab", { timeout: 20_000 });
      await expect(seen.getByTestId("event-closed")).toHaveCount(0);
      await visitor.close();
    } finally {
      await call("DELETE", `/web-forms/${slug}/`);
    }
  });

  test("R4 · a handoff waits under Needs you, counted in the sidebar, until it is marked done", async ({
    page,
  }) => {
    const { key, call } = await crm(page);
    const person = await call("POST", "/persons/", { name: `${stamp} Maya Park` });
    try {
      // What `request_counselor` leaves: an open task with the handoff marker.
      await call("POST", "/activities/", {
        type: "task",
        title: `${stamp} Talk to Maya`,
        comment: "Asked about her aid award.",
        person: person.id,
        is_done: false,
        metadata: { handoff: { reason: "Aid award", conversation: "" } },
      });
      await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/needs-you`);
      const row = page.getByTestId("handoffs").getByRole("listitem").filter({ hasText: stamp });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("needs-you-count")).toBeVisible();
      await row.getByRole("button", { name: "Done" }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await call("DELETE", `/persons/${person.id}/`);
    }
  });

  test("R5 · a queued message opens for review, links to the person's own mail, and Mark sent clears it", async ({
    page,
  }) => {
    const { key, call } = await crm(page);
    const email = `${stamp}@example.edu`;
    const person = await call("POST", "/persons/", {
      name: `${stamp} Leo Ortiz`,
      primary_email: email,
    });
    try {
      // What `book_visit` and `queue_message` leave: an open email with the follow-up marker.
      await call("POST", "/activities/", {
        type: "email",
        title: `${stamp} Your visit`,
        comment: "See you Saturday at ten.",
        person: person.id,
        is_done: false,
        metadata: { follow_up: { channel: "email", kind: "confirmation", by: "Recruit (AI)" } },
      });
      await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/needs-you`);
      const row = page.getByTestId("follow-ups").getByRole("listitem").filter({ hasText: stamp });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("button", { name: "Review" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("To")).toHaveValue(email, { timeout: 20_000 });
      await expect(dialog.locator('a[aria-label="Open in mail app"]')).toHaveAttribute(
        "href",
        new RegExp(`^mailto:${stamp}@example\\.edu\\?subject=`),
      );
      await dialog.getByRole("button", { name: "Mark sent" }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await call("DELETE", `/persons/${person.id}/`);
    }
  });

  test("R6 · the public chat says it is an AI agent before anything is typed", async ({
    page,
    browser,
  }) => {
    const key = await org(page);
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const chat = await visitor.newPage();
    await chat.goto(`${appHost}/chat/${encodeURIComponent(key)}`);
    test.skip(
      await chat.getByRole("heading", { name: "This chat is not available" }).isVisible(),
      "Recruit is not set up on this organization",
    );
    await expect(chat.getByTestId("ai-notice")).toContainText("AI agent", { timeout: 30_000 });
    await expect(chat.getByRole("textbox").first()).toBeVisible({ timeout: 30_000 });
    await visitor.close();
  });

  /** A Settings tab of an admin's organization with the Chief of Staff set up; skips otherwise. */
  async function settingsTab(page: Page, tab: string, name: string) {
    const key = await org(page);
    test.skip(!(await isAdminOf(page, key)), "Settings tabs are an admin's");
    await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/settings?tab=${tab}`);
    const panel = page.getByRole("tabpanel", { name });
    await expect(panel).toBeVisible({ timeout: 30_000 });
    return panel;
  }

  test("R7 · Settings → Schedule offers the daily outreach run above the platform's task list", async ({
    page,
  }) => {
    const panel = await settingsTab(page, "schedule", "Schedule");
    const outreach = panel.getByRole("heading", { name: "Daily outreach" });
    await expect(outreach.or(panel.getByText("Set up the Chief of Staff first."))).toBeVisible({
      timeout: 30_000,
    });
    test.skip(
      !(await outreach.isVisible()),
      "the Chief of Staff is not set up on this organization",
    );
    // Offered, or already scheduled: never both, never neither.
    await expect(
      panel
        .getByRole("button", { name: "Schedule daily outreach" })
        .or(panel.getByTestId("outreach-on")),
    ).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Schedule Task" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("R8 · Settings → Connectors names the mail for approved messages above the platform's connectors", async ({
    page,
  }) => {
    const panel = await settingsTab(page, "connectors", "Connectors");
    const mail = panel.getByRole("heading", { name: "Mail for approved messages" });
    await expect(mail.or(panel.getByText("Set up the Chief of Staff first."))).toBeVisible({
      timeout: 30_000,
    });
    test.skip(!(await mail.isVisible()), "the Chief of Staff is not set up on this organization");
    await expect(panel.getByRole("combobox", { name: "Mail connector" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Add Connector" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("R9 · Settings → Branding refuses an ad tag that is not an ID", async ({ page }) => {
    const panel = await settingsTab(page, "branding", "Branding");
    const tag = panel.getByLabel("Google tag ID");
    const save = panel.getByRole("button", { name: "Save tags" });
    await expect(tag).toBeVisible({ timeout: 30_000 });
    const before = await tag.inputValue();
    await tag.fill('G-ABC"><script>');
    await expect(panel.getByText("That does not look like a valid ID.")).toBeVisible();
    await expect(save).toBeDisabled();
    // Put back as found: nothing is saved by this journey.
    await tag.fill(before);
    await expect(panel.getByText("That does not look like a valid ID.")).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test("R10 · a shortlist under Needs you keeps the student a reviewer ticks, tags them, files them in the CRM app, and keeps only the other's handle", async ({
    page,
  }) => {
    // Two CRMs, each tag looked up before and after: more platform calls than the default allows.
    test.slow();
    const { key, call, crmApp } = await crm(page);
    const TAGS = ["Found on Reddit"];
    const recruitTags = await tagsNamed(call, TAGS);
    const crmAppTags = await tagsNamed(crmApp, TAGS);
    // What `shortlist_found_students` leaves: an open task, marked `shortlist`, on the holder record.
    const holderName = "Students found on social channels";
    const holders = (await call(
      "GET",
      `/organizations/?name__iexact=${encodeURIComponent(holderName)}`,
    )) as { results: { id: string; name: string }[] };
    const had = holders.results.find((o) => o.name === holderName);
    const holder =
      had ?? ((await call("POST", "/organizations/", { name: holderName })) as { id: string });
    const candidate = (who: string) => ({
      name: `${stamp} ${who}`,
      platform: "reddit",
      handle: `${stamp}-${who.toLowerCase()}`,
      said: "Starting my nursing prerequisites this fall.",
      why: "Plans to study nursing.",
    });
    const task = (await call("POST", "/activities/", {
      type: "task",
      title: `Students found: ${stamp}`,
      organization: holder.id,
      is_done: false,
      metadata: {
        shortlist: {
          criteria: `${stamp} nursing students`,
          source: "r/nursing",
          basis: "An end-to-end test; nobody is contacted.",
          at: new Date().toISOString(),
          proposed: 2,
          people: [candidate("Kept"), candidate("Left")],
        },
      },
    })) as { id: number };
    const found = async (who: string) => {
      const uid = `reddit:${stamp}-${who}`;
      const { results } = (await call("GET", `/persons/?search=${encodeURIComponent(uid)}`)) as {
        results: { id: string; unique_id?: string }[];
      };
      return results.find((p) => p.unique_id === uid);
    };
    try {
      await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/needs-you`);
      const row = page.getByTestId("shortlists").getByRole("listitem").filter({ hasText: stamp });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("button", { name: "Review" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("checkbox", { name: `${stamp} Kept` }).click();
      await dialog.getByRole("button", { name: "Add selected (1)" }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });
      expect(await found("kept")).toBeTruthy();
      expect(await found("left")).toBeUndefined();
      // Closed in one write, with the counts and nobody's details.
      const after = (await call("GET", `/activities/${task.id}/`)) as {
        is_done: boolean;
        metadata: { shortlist: { people: unknown[]; kept: number } };
      };
      expect(after.is_done).toBe(true);
      expect(after.metadata.shortlist).toMatchObject({ people: [], kept: 1 });
      // The one passed over: their handle, and nothing else about them.
      expect((after.metadata as { passed?: string[] }).passed).toEqual([`reddit:${stamp}-left`]);
      // Where they came from, as a tag; and a copy in the CRM app's own records, tagged the same.
      const kept = (await byUniqueId(call, `reddit:${stamp}-kept`))!;
      expect(kept.tags.map((t) => t.name)).toContain("Found on Reddit");
      const copy = await byUniqueId(crmApp, `reddit:${stamp}-kept`);
      expect(copy?.app).toBe("");
      expect(copy?.tags.map((t) => t.name)).toEqual(["Found on Reddit"]);
      expect(await byUniqueId(crmApp, `reddit:${stamp}-left`)).toBeUndefined();
      // Where students are talking: Scoreboard counts the student kept on Reddit.
      if (await isAdminOf(page, key)) {
        await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/scoreboard`);
        const reddit = page.getByTestId("where-channels").getByRole("row", { name: /^Reddit/ });
        await expect(reddit).toBeVisible({ timeout: 30_000 });
        const keptHere = Number(await reddit.getByRole("cell").nth(2).textContent());
        expect(keptHere).toBeGreaterThanOrEqual(1);
      }
    } finally {
      const kept = await found("kept");
      if (kept) await call("DELETE", `/persons/${kept.id}/`);
      const copy = await byUniqueId(crmApp, `reddit:${stamp}-kept`);
      if (copy) await crmApp("DELETE", `/persons/${copy.id}/`);
      await call("DELETE", `/activities/${task.id}/`);
      if (!had) await call("DELETE", `/organizations/${holder.id}/`);
      await removeNewTags(call, TAGS, recruitTags);
      await removeNewTags(crmApp, TAGS, crmAppTags);
    }
  });

  test("R11 · Do not contact on a kept student reaches their copy in the CRM app, and turning it off here leaves it there", async ({
    page,
  }) => {
    test.slow();
    const { key, call, crmApp, authorization } = await crm(page);
    const TAGS = ["Found on Reddit", "Do not contact"];
    const recruitTags = await tagsNamed(call, TAGS);
    const crmAppTags = await tagsNamed(crmApp, TAGS);
    const uid = `reddit:${stamp}-stop`;
    const person = (await call("POST", "/persons/", {
      name: `${stamp} Stop`,
      unique_id: uid,
      lifecycle_stage: "lead",
      metadata: {
        found: {
          platform: "reddit",
          handle: `${stamp}-stop`,
          said: "Starting my nursing prerequisites this fall.",
          source: "r/nursing",
          basis: "An end-to-end test; nobody is contacted.",
          at: new Date().toISOString(),
        },
      },
    })) as { id: string };
    const copyTags = async () =>
      (await byUniqueId(crmApp, uid))?.tags.map((t) => t.name).sort() ?? [];
    try {
      // Kept, as Add selected keeps a student: the channel tag and the copy.
      const kept = await page.request.post(`${appHost}/api/admin/prospects/found-sync`, {
        headers: { authorization },
        data: { org: key, personId: person.id, kept: true },
      });
      expect(kept.ok(), `found-sync → ${kept.status()}`).toBe(true);
      expect(await copyTags()).toEqual(["Found on Reddit"]);
      await page.goto(`${appHost}/platform/${encodeURIComponent(key)}/prospects/${person.id}`);
      const stop = page.getByRole("switch", { name: "Do not contact" });
      await stop.click();
      await expect
        .poll(copyTags, { timeout: 20_000 })
        .toEqual(["Do not contact", "Found on Reddit"]);
      // Recruit never takes the mark off: only someone in the CRM app can.
      await stop.click();
      await expect(stop).not.toBeChecked();
      await page.waitForTimeout(3_000);
      expect(await copyTags()).toEqual(["Do not contact", "Found on Reddit"]);
    } finally {
      const copy = await byUniqueId(crmApp, uid);
      if (copy) await crmApp("DELETE", `/persons/${copy.id}/`);
      await call("DELETE", `/persons/${person.id}/`);
      await removeNewTags(call, TAGS, recruitTags);
      await removeNewTags(crmApp, TAGS, crmAppTags);
    }
  });

  test("R12 · a saved search is listed as the Chief of Staff's own task until it is deleted", async ({
    page,
  }) => {
    const connectors = await settingsTab(page, "connectors", "Connectors");
    const finding = connectors.getByTestId("finding");
    await expect(finding.or(connectors.getByText("Set up the Chief of Staff first."))).toBeVisible({
      timeout: 30_000,
    });
    test.skip(
      !(await finding.isVisible()),
      "the Chief of Staff is not set up on this organization",
    );
    const basis = finding.getByLabel("Why the university may contact people it finds");
    const had = await basis.inputValue();
    const program = `${stamp} Business`;
    const setBasis = async (value: string) => {
      await basis.fill(value);
      await finding.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
    };
    // A search runs only once a basis is written: this journey writes one for itself, and takes it back.
    if (!had) await setBasis("An end-to-end test of saved searches; nobody is searched for.");
    const schedule = await settingsTab(page, "schedule", "Schedule");
    const searches = schedule.getByTestId("saved-searches");
    const row = searches.getByTestId("saved-search").filter({ hasText: program });
    try {
      await searches.getByLabel("Program").fill(program);
      await searches.getByLabel("Area").fill("New York City area");
      await searches.getByRole("button", { name: "Save search" }).click();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(`${program} · New York City area`);
      await expect(row).toContainText("Every Monday at");
      await row.getByRole("button", { name: "Delete" }).click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
    } finally {
      if (await row.count()) await row.getByRole("button", { name: "Delete" }).click();
      if (!had) {
        await settingsTab(page, "connectors", "Connectors");
        await setBasis("");
      }
    }
  });
});
