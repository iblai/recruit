import { afterEach, describe, expect, it, vi } from "vitest";
import { setupChiefOfStaff } from "../lib/recruit/agent";

type Call = { method: string; path: string; auth: string; body: unknown };

/**
 * A fake platform that records every request and answers what setup needs.
 * `policies` is what the CRM User lookup returns; `scopedKeyWorks` is whether
 * the CRM accepts a `token_policies` key (RBAC on) or refuses it (RBAC off).
 */
function fakePlatform({ policies = [{ id: 42, name: "CRM User" }], scopedKeyWorks = true } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const { pathname, search } = new URL(url);
    const path = pathname + search;
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, auth: headers.Authorization, body });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === "DELETE") return reply({ detail: "Not found." }, 404);
    if (path.startsWith("/dm/api/core/rbac/policies/"))
      return reply({ count: 1, results: policies });
    if (path.endsWith("/platform/api-tokens/")) {
      const scoped = (body as { mode?: string }).mode === "token_policies";
      return reply({ key: scoped ? "scoped-key" : "owner-key" });
    }
    if (path.startsWith("/dm/api/crm/pipelines/"))
      return scopedKeyWorks ? reply({ count: 0, results: [] }) : reply({ detail: "No." }, 403);
    if (path.endsWith("/mentor-with-settings/")) return reply({ unique_id: "agent-1" });
    if (method === "POST" && path.endsWith("/mcp-servers/")) return reply({ id: 7 });
    if (method === "GET" && path.endsWith("/metadata/")) return reply({ metadata: {} });
    return reply(method === "GET" ? { results: [] } : {});
  });
  return calls;
}

const setup = (log?: (line: string) => void) =>
  setupChiefOfStaff({
    org: "northfield",
    username: "admin",
    appUrl: "https://recruit.example.edu",
    authorization: "Token session",
    log,
  });

const connection = (calls: Call[]) =>
  calls.find((c) => c.method === "POST" && c.path.endsWith("/mcp-server-connections/"));
const saved = (calls: Call[]) =>
  (
    calls.findLast((c) => c.method === "PUT" && c.path.endsWith("/metadata/"))?.body as {
      metadata: { apps: { recruit: Record<string, unknown> } };
    }
  )?.metadata.apps.recruit;

afterEach(() => vi.unstubAllGlobals());

describe("setupChiefOfStaff — the tools' key", () => {
  it("scopes the key to the CRM User policy where the platform enforces RBAC", async () => {
    const calls = fakePlatform();
    const log: string[] = [];
    const result = await setup((line) => log.push(line));

    expect(result).toMatchObject({ toolsWired: true, toolsAccess: "crm-user" });
    const lookup = calls.find((c) => c.path.startsWith("/dm/api/core/rbac/policies/"));
    expect(lookup?.path).toBe(
      "/dm/api/core/rbac/policies/?name=CRM%20User&include_users=false&include_groups=false",
    );
    const mints = calls.filter((c) => c.method === "POST" && c.path.endsWith("/api-tokens/"));
    expect(mints.map((c) => c.body)).toEqual([
      {
        name: "recruit-tools",
        platform_key: "northfield",
        mode: "token_policies",
        policies_to_add: [42],
      },
    ]);
    const probe = calls.find((c) => c.path.startsWith("/dm/api/crm/pipelines/"));
    expect(probe?.auth).toBe("Api-Token scoped-key");
    // Everything else acts as the admin's session.
    expect(calls.filter((c) => c !== probe).every((c) => c.auth === "Token session")).toBe(true);
    expect(connection(calls)?.body).toMatchObject({
      server: 7,
      scope: "platform",
      credentials: "scoped-key",
      authorization_scheme: "Bearer",
    });
    expect(saved(calls)).toMatchObject({ agentId: "agent-1", toolsAccess: "crm-user" });
    expect(log.join("\n")).not.toContain("scoped-key");
  });

  it("falls back to an owner key when RBAC is off and the CRM refuses the scoped one", async () => {
    const calls = fakePlatform({ scopedKeyWorks: false });
    const log: string[] = [];
    const result = await setup((line) => log.push(line));

    expect(result.toolsAccess).toBe("owner");
    const keyCalls = calls.filter((c) => c.path.includes("/api-tokens/"));
    expect(keyCalls.map((c) => [c.method, c.path])).toEqual([
      ["DELETE", "/dm/api/core/platform/api-tokens/recruit-tools?platform_key=northfield"],
      ["POST", "/dm/api/core/platform/api-tokens/"],
      ["DELETE", "/dm/api/core/platform/api-tokens/recruit-tools?platform_key=northfield"],
      ["POST", "/dm/api/core/platform/api-tokens/"],
    ]);
    expect(keyCalls[3].body).toEqual({ name: "recruit-tools", platform_key: "northfield" });
    expect(connection(calls)?.body).toMatchObject({ credentials: "owner-key" });
    expect(saved(calls)).toMatchObject({ toolsAccess: "owner" });
    expect(log.join("\n")).not.toMatch(/scoped-key|owner-key/);
  });

  it("mints an owner key when the platform has no CRM User policy", async () => {
    const calls = fakePlatform({ policies: [{ id: 9, name: "CRM User (custom)" }] });
    const result = await setup();

    expect(result.toolsAccess).toBe("owner");
    const mints = calls.filter((c) => c.method === "POST" && c.path.endsWith("/api-tokens/"));
    expect(mints.map((c) => c.body)).toEqual([
      { name: "recruit-tools", platform_key: "northfield" },
    ]);
    expect(calls.some((c) => c.path.startsWith("/dm/api/crm/"))).toBe(false);
  });

  it("mints nothing when the platform cannot reach the tools", async () => {
    const calls = fakePlatform();
    const result = await setupChiefOfStaff({
      org: "northfield",
      username: "admin",
      appUrl: "http://localhost:3000",
      authorization: "Token session",
    });
    expect(result).toMatchObject({ toolsWired: false, toolsAccess: null });
    expect(calls.some((c) => c.path.includes("/api-tokens/"))).toBe(false);
  });
});
