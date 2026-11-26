import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as enrich } from "../app/api/admin/prospects/enrich/route";
import { POST as foundSync } from "../app/api/admin/prospects/found-sync/route";

const ID = "6f1c2b8e-1111-4222-8333-944455556666";
const BASIS = "They posted in public that they want to study nursing.";
const FOUND = {
  platform: "reddit",
  handle: "maya_p",
  said: "Nursing next fall.",
  source: "r/nursing",
  basis: "b",
  at: "2027-03-01T00:00:00Z",
};
let orgs = 0;

/**
 * The platform as the routes see it: the caller, the org's settings (a new
 * org each time: they are cached), Recruit's record, the CRM app's records,
 * and one turn with the Chief of Staff that saves a profile when `saves`.
 */
function platform({
  metadata = {} as Record<string, unknown>,
  basis = BASIS,
  reply = "",
  saves = true,
  copies = [] as Record<string, unknown>[],
} = {}) {
  const org = `org-${++orgs}`;
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let readAt = "";
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const record = () => ({
    id: ID,
    name: "Maya Park",
    unique_id: "reddit:maya_p",
    active: true,
    tags: [],
    app: "recruit",
    metadata: {
      found: { ...FOUND, ...(readAt && { profile: { bio: "Future nurse", at: readAt } }) },
      ...metadata,
    },
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, ...(body && { body }) });
    const scoped = url.includes("app=recruit");
    if (url.includes("/token/verify/")) return json(200, { username: "admin" });
    if (url.includes("/metadata/"))
      return json(200, { metadata: { apps: { recruit: { agentId: "a1", foundBasis: basis } } } });
    if (url.includes(`/persons/${ID}/?`) && method === "GET") return json(200, record());
    if (url.includes("/sessions/")) return json(201, { session_id: "s1" });
    if (url.includes("/api/mentor/chat/")) {
      if (saves) readAt = "2027-03-10T12:00:00.000Z";
      return new Response(`${JSON.stringify({ data: reply })}\n\n${JSON.stringify({ eos: true })}`);
    }
    if (url.includes("/overview/")) return json(200, { app: "recruit" });
    if (url.includes("/persons/?search=")) return json(200, { results: copies, next_page: null });
    if (/\/tags\/\?/.test(url)) return json(200, { results: [] });
    if (/\/crm\/tags\//.test(url) && method === "POST")
      return json(201, { id: 5, name: body?.name, app: scoped ? "recruit" : "" });
    if (/\/persons\/[^/]+\/tags\//.test(url)) return json(201, {});
    if (/\/crm\/persons\/(\?|$)/.test(url) && method === "POST")
      return json(201, { id: "c1", app: "", tags: [], ...body });
    if (url.includes("/activities/"))
      return method === "GET" ? json(200, { results: [] }) : json(201, { id: 9 });
    if (url.includes(`/persons/${ID}/metadata/`)) return json(200, record());
    throw new Error(`unexpected ${method} ${url}`);
  });
  const post = (route: typeof enrich, json: Record<string, unknown>) =>
    route(
      new NextRequest("http://localhost/api/admin/prospects", {
        method: "POST",
        headers: { authorization: "Token t", "content-type": "application/json" },
        body: JSON.stringify({ org, personId: ID, ...json }),
      }),
    );
  return { calls, post };
}

afterEach(() => vi.unstubAllGlobals());

const agentTurns = <T extends { url: string }>(calls: T[]) =>
  calls.filter((c) => c.url.includes("/api/mentor/chat/"));

describe("POST /api/admin/prospects/found-sync", () => {
  it("tags a kept student in Recruit with their channel, and files the CRM app's copy", async () => {
    const { calls, post } = platform();
    const res = await post(foundSync, { kept: true });
    expect(await res.json()).toEqual({ copy: "added", stopped: false });
    const writes = calls.filter((c) => c.method === "POST");
    // Recruit's tag is made in Recruit's records; the copy and its tag in the CRM app's, which name no app.
    expect(
      writes.map((c) => [c.url.includes("app=recruit"), c.url.replace(/^.*\/crm/, "")]),
    ).toEqual([
      [true, "/tags/?app=recruit"],
      [true, `/persons/${ID}/tags/?app=recruit`],
      [false, "/persons/"],
      [false, "/tags/"],
      [false, "/persons/c1/tags/"],
      [false, "/activities/"],
    ]);
  });

  it("only marks an existing copy when Do not contact is set, and refuses anyone not found on a channel", async () => {
    const { calls, post } = platform({ metadata: { opted_out: true } });
    expect(await (await post(foundSync, {})).json()).toEqual({ copy: "none", stopped: true });
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
    const listed = platform({ metadata: { found: { source: "a list", basis: "b", at: "t" } } });
    expect((await listed.post(foundSync, {})).status).toBe(400);
    expect((await listed.post(foundSync, { personId: "../../x" })).status).toBe(400);
  });
});

describe("a student kept again", () => {
  it("is marked Do not contact here when their copy in the CRM app already says so", async () => {
    const stop = { id: 3, name: "Do not contact" };
    const { calls, post } = platform({
      copies: [{ id: "c2", app: "", unique_id: "reddit:maya_p", tags: [stop] }],
    });
    const res = await post(foundSync, { kept: true });
    expect(await res.json()).toEqual({ copy: "on_file", stopped: true, opted_out_here: true });
    const patched = calls.find((c) => c.method === "PATCH");
    expect(patched?.url).toMatch(new RegExp(`/persons/${ID}/metadata/\\?app=recruit$`));
    expect(patched?.body).toMatchObject({ opted_out: true });
    // Recruit never takes the mark off the copy.
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
});

describe("POST /api/admin/prospects/enrich", () => {
  it("asks the Chief of Staff to read the profile, and answers once it is saved", async () => {
    const { calls, post } = platform();
    const res = await post(enrich, {});
    expect(res.status).toBe(200);
    const [turn] = agentTurns(calls);
    expect(turn.body).toMatchObject({ flow: { name: "a1" }, metadata: { purpose: "enrich" } });
    expect(String(turn.body?.prompt)).toMatch(
      /trudax--reddit-scraper-lite[\s\S]*enrich_found_prospect/,
    );
  });

  it("passes on why when nothing was saved", async () => {
    const { post } = platform({
      reply: "Their profile is private, so nothing was saved.",
      saves: false,
    });
    const res = await post(enrich, {});
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Their profile is private, so nothing was saved." });
  });

  it("refuses before any agent turn without a basis, or for someone who said stop", async () => {
    for (const setup of [{ basis: "" }, { metadata: { opted_out: true } }]) {
      const { calls, post } = platform(setup);
      expect((await post(enrich, {})).status).toBe(400);
      expect(agentTurns(calls)).toEqual([]);
    }
  });
});
