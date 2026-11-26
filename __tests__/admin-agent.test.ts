import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../app/api/admin/agent/route";
import { FINDING_CONNECTOR_URL } from "../lib/recruit/connectors";

/** The platform as the route sees it: the caller verified, the settings read, the agent's own settings answering `status` with `servers`. */
function platform(status: number, servers: object[] = []) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const json = (code: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status: code,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      ...(init.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url.includes("/token/verify/")) return json(200, { username: "admin" });
    if (url.includes("/metadata/"))
      return json(200, { metadata: { apps: { recruit: { agentId: "a1" } } } });
    if (url.includes("/mentors/a1/settings/"))
      return status === 200
        ? json(200, { mcp_servers: servers })
        : json(status, { detail: "Not found." });
    if (url.includes("/mcp-servers/")) return json(200, { auth_scope: "platform" });
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const apify = {
  id: 7,
  name: "Apify",
  url: FINDING_CONNECTOR_URL,
  auth_type: "token",
  auth_scope: "user",
  credentials: "k",
};

describe("GET /api/admin/agent", () => {
  const get = () =>
    GET(
      new NextRequest("http://localhost/api/admin/agent?org=northfield", {
        headers: { authorization: "Token t" },
      }),
    );

  it("still answers when the agent is gone or the platform falters, so setup can repair it", async () => {
    for (const status of [404, 500, 429]) {
      platform(status);
      const res = await get();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ agentId: "a1", connectors: null });
    }
  });

  it("names the agent's connectors by host, never by address or key", async () => {
    platform(200, [apify]);
    const out = await (await get()).json();
    expect(out).toMatchObject({
      connectors: [{ id: 7, name: "Apify", host: "mcp.apify.com", pinned: true, keyIgnored: true }],
    });
    expect(JSON.stringify(out)).not.toMatch(/tools=|"k"/);
  });
});

describe("PATCH /api/admin/agent", () => {
  const patch = (connectorId: unknown) =>
    PATCH(
      new NextRequest("http://localhost/api/admin/agent", {
        method: "PATCH",
        headers: { authorization: "Token t", "content-type": "application/json" },
        body: JSON.stringify({ org: "northfield", connectorId }),
      }),
    );
  const writes = (calls: { method: string }[]) => calls.filter((c) => c.method === "PATCH");

  it("shares the unused key of a connector limited to the scrapers, as the caller", async () => {
    const calls = platform(200, [apify]);
    expect((await patch(7)).status).toBe(200);
    expect(writes(calls)).toEqual([
      {
        url: expect.stringMatching(/\/orgs\/northfield\/users\/admin\/mcp-servers\/7\/$/),
        method: "PATCH",
        body: { auth_scope: "platform" },
      },
    ]);
  });

  it("writes nothing for a wider Apify connector, one not on the agent, or a key already used", async () => {
    const wide = { ...apify, id: 8, url: "https://mcp.apify.com" };
    const used = { ...apify, id: 9, auth_scope: "platform" };
    const calls = platform(200, [wide, used]);
    for (const id of [8, 9, 99, "7"]) expect((await patch(id)).status).toBe(400);
    expect(writes(calls)).toEqual([]);
  });
});
