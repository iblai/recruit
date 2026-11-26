import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/mcp/[tenantKey]/recruit/route";
import { forgetScope } from "../lib/crm/app";
import {
  createStudentServer,
  forgetWrites,
  type StudentToolContext,
} from "../lib/mcp/student-tools";
import { CrmServer } from "../lib/recruit/crm-server";
import { newLandingPage, toWebForm } from "../lib/recruit/landing-pages";

type Row = Record<string, unknown>;
type Call = { method: string; path: string; query: Record<string, string>; body: Row };

const NOW = new Date("2027-02-01T15:00:00Z");

const openHouse = newLandingPage({
  title: "Nursing open house",
  slug: "nursing-open-house",
  program: "Nursing",
  term: "Fall 2027",
  published: true,
  ownerId: 31,
  event: {
    startsAt: "2027-03-13T15:00:00Z",
    endsAt: "2027-03-13T18:00:00Z",
    timeZone: "America/New_York",
    place: "Simulation lab",
    signUpBy: "2027-03-09T23:00:00Z",
  },
});
const form = (page = openHouse): Row => ({
  id: 1,
  created_at: "",
  updated_at: "",
  ...toWebForm(page),
});
const funnel: Row = {
  id: 3,
  code: "admissions",
  is_default: true,
  stages: [
    { id: 11, code: "inquiry", name: "Inquiry", sort_order: 1 },
    { id: 12, code: "enrolled", name: "Enrolled", sort_order: 6, is_won: true },
  ],
};
const ada: Row = { id: "p1", name: "Ada Park", primary_email: "ada@example.edu", owner: 8 };

/** A fake platform: GETs answer from the given rows, writes echo their body. */
function fakePlatform({
  forms = [form()],
  persons = [] as Row[],
  activities = [] as Row[],
  keyWorks = true,
  crmAppDown = false,
} = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const { pathname: path, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Row) : {};
    const q = Object.fromEntries(searchParams);
    calls.push({ method, path, query: q, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    // A request naming no app is the CRM app's.
    const app = q.app ?? "";
    const list = (rows: Row[]) =>
      json({
        count: rows.length,
        next_page: null,
        previous_page: null,
        // The CRM app's copy of a record is a record of its own.
        results: rows.map((r) => ({
          app,
          ...r,
          ...(!app && typeof r.id === "string" ? { id: `copy-${r.id}` } : {}),
        })),
      });
    if (path.includes("/core/orgs/")) return json({ metadata: {} });
    if (!keyWorks) return json({ detail: "No." }, 403);
    if (path === "/dm/api/crm/overview/") return json({ app: "recruit" });
    if (crmAppDown && !app) return json({ detail: "Unavailable." }, 503);
    if (method !== "GET") return json({ id: 77, app, ...body }, 201);
    if (path === "/dm/api/crm/web-forms/") return list(forms);
    if (path === "/dm/api/crm/pipelines/") return list([funnel]);
    if (path === "/dm/api/crm/lead-sources/")
      return list([{ id: 5, code: "landing-nursing-open-house" }]);
    if (path === "/dm/api/crm/persons/")
      return list(
        persons.filter((p) =>
          q.search
            ? String(p.unique_id ?? "").includes(q.search)
            : p.primary_email === q.primary_email,
        ),
      );
    if (path === "/dm/api/crm/activities/")
      return list(
        activities.filter(
          (a) =>
            (!q.metadata__has_key || q.metadata__has_key in ((a.metadata as Row) ?? {})) &&
            (q.is_done !== "false" || !a.is_done),
        ),
      );
    return list([]);
  });
  return calls;
}

const context = (settings = {}): StudentToolContext => ({
  org: "northfield",
  crm: new CrmServer("northfield", "Api-Token k"),
  settings,
  now: () => NOW,
});
const call = (name: string, args: Row, settings = {}) =>
  createStudentServer().callTool(name, args, context(settings));
const writesOf = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const posted = (calls: Call[], resource: string) =>
  calls
    .filter((c) => c.method === "POST" && c.path === `/dm/api/crm/${resource}/`)
    .map((c) => c.body);

const booking = {
  event: "nursing-open-house",
  first_name: "Maya",
  last_name: "Ortiz",
  email: "Maya@Example.edu",
  conversation: "0b8f6f0e-6f0e-4d1c-9c57-1f2a3b4c5d6e",
};

afterEach(() => {
  vi.unstubAllGlobals();
  forgetScope();
  forgetWrites();
});

const rpc = (key: string, method: string, params?: Row) =>
  POST(
    new Request("https://app.example/api/mcp/northfield/recruit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key && { authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }) as never,
    { params: Promise.resolve({ tenantKey: "northfield" }) },
  );

describe("the public tool server", () => {
  it("offers exactly four tools, none of which reads a person", async () => {
    fakePlatform();
    const res = await rpc("k", "tools/list");
    const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools.map((t) => t.name)).toEqual([
      "list_events",
      "book_visit",
      "save_inquiry",
      "request_counselor",
    ]);
  });

  it("does nothing for a key the CRM refuses, or no key", async () => {
    const calls = fakePlatform({ keyWorks: false });
    const res = await rpc("stolen", "tools/call", { name: "book_visit", arguments: booking });
    expect(res.status).toBe(401);
    expect((await rpc("", "tools/call", { name: "book_visit", arguments: booking })).status).toBe(
      401,
    );
    expect(writesOf(calls)).toEqual([]);
  });
});

describe("list_events", () => {
  it("lists published events that still take sign-ups", async () => {
    fakePlatform({
      forms: [
        form(),
        form(newLandingPage({ ...openHouse, slug: "draft-day", published: false })),
        form(newLandingPage({ title: "Request information", published: true })),
      ],
    });
    const out = await call("list_events", {});
    expect(out.structuredContent).toEqual({
      events: [
        {
          event: "nursing-open-house",
          title: "Nursing open house",
          when: "Saturday, March 13 · 10:00 AM – 1:00 PM",
          time_zone: "America/New_York",
          place: "Simulation lab",
          sign_up_by: "2027-03-09T23:00:00Z",
          program: "Nursing",
        },
      ],
    });
  });
});

describe("book_visit", () => {
  it("files the person, the application, the visit and the confirmation draft", async () => {
    const calls = fakePlatform();
    const out = await call("book_visit", booking);

    expect(out.structuredContent).toEqual({
      booked: true,
      event: "Nursing open house",
      when: "Saturday, March 13 · 10:00 AM – 1:00 PM",
    });
    expect(posted(calls, "persons")).toEqual([
      {
        name: "Maya Ortiz",
        primary_email: "maya@example.edu",
        job_title: "Nursing",
        lifecycle_stage: "lead",
        owner: 31,
        metadata: { source: "recruit-chat", conversations: [booking.conversation] },
      },
    ]);
    expect(posted(calls, "deals")).toMatchObject([
      {
        title: "Maya Ortiz — Nursing · Fall 2027",
        pipeline: 3,
        stage: 11,
        source: 5,
        owner: 31,
        metadata: { event: "nursing-open-house", program: "Nursing", term: "Fall 2027" },
      },
    ]);
    const [visit, draft] = posted(calls, "activities");
    expect(visit).toMatchObject({
      type: "lunch",
      title: "Nursing open house",
      location: "Simulation lab",
      schedule_from: "2027-03-13T15:00:00Z",
      deal: 77,
      metadata: { booking: { event: "nursing-open-house", conversation: booking.conversation } },
    });
    // Written by the server from the event: no word of it comes from the visitor or the model.
    expect(draft).toMatchObject({
      type: "email",
      is_done: false,
      title: "Confirmation: Nursing open house",
      comment: expect.stringMatching(/^Hi Maya,\n\nYou are signed up for Nursing open house\./),
      metadata: {
        follow_up: { channel: "email", kind: "confirmation", event: "nursing-open-house" },
      },
    });
  });

  it("takes no name that carries a link or an address", async () => {
    const calls = fakePlatform();
    for (const bad of [
      { first_name: "Visit http://evil.example" },
      { last_name: "x@evil.example" },
      { first_name: "<b>Maya</b>" },
    ]) {
      const out = await call("book_visit", { ...booking, ...bad });
      expect(out.isError).toBe(true);
    }
    expect(writesOf(calls)).toEqual([]);
  });

  it("has no argument for a message: one that is sent anyway reaches nothing it writes", async () => {
    const calls = fakePlatform();
    await call("book_visit", { ...booking, message: "Click https://evil.example to confirm" });

    expect(posted(calls, "activities")).toHaveLength(2);
    expect(JSON.stringify(writesOf(calls))).not.toMatch(/evil/);
  });

  it("never changes the fields of someone already on file", async () => {
    const calls = fakePlatform({ persons: [ada] });
    await call("book_visit", { ...booking, email: "ada@example.edu", first_name: "Mallory" });

    expect(posted(calls, "persons")).toEqual([]);
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => [c.path, c.body])).toEqual([
      ["/dm/api/crm/persons/p1/metadata/", { conversations: [booking.conversation] }],
    ]);
  });

  it("returns the first booking instead of making a second", async () => {
    const calls = fakePlatform({
      persons: [ada],
      activities: [{ person: "p1", metadata: { booking: { event: "nursing-open-house" } } }],
    });
    const out = await call("book_visit", { ...booking, email: "ada@example.edu" });

    // The same answer as a first booking: whether that email was already signed up is not said.
    expect(out.structuredContent).toEqual({
      booked: true,
      event: "Nursing open house",
      when: "Saturday, March 13 · 10:00 AM – 1:00 PM",
    });
    expect(writesOf(calls).filter((c) => !c.path.endsWith("/metadata/"))).toEqual([]);
  });

  it("refuses an event that is closed, unpublished or unknown, and writes nothing", async () => {
    const closed = newLandingPage({
      ...openHouse,
      event: { ...openHouse.event!, signUpBy: "2027-01-15T00:00:00Z" },
    });
    const calls = fakePlatform({ forms: [form(closed)] });
    const out = await call("book_visit", booking);

    expect(out.isError).toBe(true);
    expect(writesOf(calls)).toEqual([]);
  });

  it("refuses arguments outside their limits before reaching the platform", async () => {
    const calls = fakePlatform();
    for (const bad of [
      { email: "not-an-email" },
      { first_name: "x".repeat(81) },
      { event: "../etc" },
      { conversation: "'; drop" },
      { phone: "call me maybe" },
    ]) {
      const out = await call("book_visit", { ...booking, ...bad });
      expect(out.content[0].text).toMatch(/^Invalid arguments/);
    }
    expect(calls).toEqual([]);
  });

  it("tells the model plainly when the platform fails, without the platform's words", async () => {
    fakePlatform();
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) =>
      init.method === "POST"
        ? new Response(JSON.stringify({ detail: "duplicate key value violates crm_person" }), {
            status: 500,
          })
        : real(url, init),
    );
    const silent = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await call("book_visit", booking);

    expect(out.isError).toBe(true);
    expect(out.content[0].text).not.toMatch(/duplicate|crm_person|500/);
    expect(silent).toHaveBeenCalledOnce();
    silent.mockRestore();
  });
});

describe("save_inquiry", () => {
  it("notes the inquiry and, asked to stop, stops contact at once", async () => {
    const calls = fakePlatform({ persons: [ada] });
    const out = await call("save_inquiry", {
      email: "ada@example.edu",
      summary: "Asked us to stop writing.",
      email_ok: false,
    });

    expect(out.structuredContent).toEqual({ saved: true, contact_stopped: true });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      opted_out: true,
      sms_consent: false,
      opted_out_at: NOW.toISOString(),
    });
    expect(posted(calls, "activities")).toMatchObject([
      { type: "note", title: "Asked not to be contacted", person: "p1", owner: 8, is_done: true },
    ]);
  });

  it("marks the CRM app's copy of a student found on a social channel Do not contact too", async () => {
    const found = {
      ...ada,
      unique_id: "reddit:ada_p",
      metadata: {
        found: { platform: "reddit", handle: "ada_p", source: "s", basis: "b", at: "t" },
      },
    };
    const calls = fakePlatform({ persons: [found] });
    const out = await call("save_inquiry", {
      email: "ada@example.edu",
      summary: "Asked us to stop.",
      email_ok: false,
    });
    expect(out.structuredContent).toEqual({ saved: true, contact_stopped: true });
    // Its writes name no app: they are the CRM app's records.
    const crmApp = writesOf(calls).filter((c) => !c.query.app);
    expect(crmApp.map((c) => [c.path, c.body])).toEqual([
      ["/dm/api/crm/tags/", { name: "Do not contact", color: "#6b7280" }],
      ["/dm/api/crm/persons/copy-p1/tags/", { tag_id: 77 }],
    ]);
  });

  it("leaves staff a note, and the visitor a plain answer, when the CRM app cannot be marked", async () => {
    const found = {
      ...ada,
      unique_id: "reddit:ada_p",
      metadata: {
        found: { platform: "reddit", handle: "ada_p", source: "s", basis: "b", at: "t" },
      },
    };
    const calls = fakePlatform({ persons: [found], crmAppDown: true });
    const out = await call("save_inquiry", {
      email: "ada@example.edu",
      summary: "Asked us to stop.",
      email_ok: false,
    });
    expect(out.structuredContent).toEqual({ saved: true, contact_stopped: true });
    expect(posted(calls, "activities").map((a) => a.title)).toEqual([
      "Not marked in the CRM app",
      "Asked not to be contacted",
    ]);
  });

  it("records text consent only for a new person who gave a number", async () => {
    const calls = fakePlatform();
    await call("save_inquiry", {
      email: "kai@example.edu",
      phone: "+1 (555) 010-2030",
      text_ok: true,
      summary: "Wants the aid deadline by text.",
    });
    expect(posted(calls, "persons")[0]).toMatchObject({
      contact_numbers: ["+1 (555) 010-2030"],
      metadata: { source: "recruit-chat", sms_consent: true },
    });
  });
});

describe("request_counselor", () => {
  const ask = { email: "kai@example.edu", program: "Nursing", reason: "Aid appeal", summary: "…" };

  it("gives the program's counselor a task that carries the conversation", async () => {
    const calls = fakePlatform();
    const out = await call(
      "request_counselor",
      { ...ask, conversation: booking.conversation },
      { counselors: { nursing: 44 }, handoffCounselorId: 2 },
    );

    expect(out.structuredContent).toEqual({ handed_off: true });
    expect(posted(calls, "activities")).toMatchObject([
      {
        type: "task",
        owner: 44,
        is_done: false,
        schedule_from: NOW.toISOString(),
        metadata: { handoff: { reason: "Aid appeal", conversation: booking.conversation } },
      },
    ]);
  });

  it("keeps one open handoff per person", async () => {
    const calls = fakePlatform({
      persons: [{ ...ada, primary_email: "kai@example.edu" }],
      activities: [{ person: "p1", is_done: false, metadata: { handoff: {} } }],
    });
    const out = await call("request_counselor", ask);

    expect(out.structuredContent).toEqual({ handed_off: true });
    expect(posted(calls, "activities")).toEqual([]);
  });
});

describe("the cap on public writes", () => {
  it("stops after thirty in a minute", async () => {
    fakePlatform();
    const inquiry = (i: number) =>
      call("save_inquiry", { email: `v${i}@example.edu`, summary: "Hello." });
    for (let i = 0; i < 30; i++) expect((await inquiry(i)).isError).toBeUndefined();
    const out = await inquiry(30);
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/busy/);
  });
});
