import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDENT_PROMPTS, setupRecruit } from "../lib/recruit/agent";
import {
  cleanOrigins,
  counselorFor,
  mergeRecruitSettings,
  readRecruitSettings,
} from "../lib/recruit/org-settings";

type Call = { method: string; path: string; auth: string; body: unknown };

/**
 * The fake platform of `tools-key.test.ts`, with the organization's stored
 * `metadata` and a tool server that can fail (`serverFails`).
 */
function fakePlatform({
  policies = [{ id: 42, name: "CRM User" }],
  scopedKeyWorks = true,
  metadata = {} as Record<string, unknown>,
  serverFails = false,
  agentSettings = undefined as Record<string, unknown> | undefined,
  knowsCategory = true,
} = {}) {
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
    if (method === "POST" && path.endsWith("/mcp-servers/"))
      return serverFails ? reply({ detail: "Down." }, 500) : reply({ id: 7 });
    if (method === "GET" && path.endsWith("/metadata/")) return reply({ metadata });
    if (!knowsCategory && path.endsWith("/prompt/") && (body as { category?: string }).category)
      return reply({ category: ["Object with name=Recruitment does not exist."] }, 400);
    if (method === "GET" && path.endsWith("/mentors/gone/settings/"))
      return reply({ detail: "Not found." }, 404);
    if (method === "GET" && agentSettings && path.endsWith("/settings/"))
      return reply(agentSettings);
    return reply(method === "GET" ? { results: [] } : {});
  });
  return calls;
}

const saved = (calls: Call[]) =>
  (
    calls.findLast((c) => c.method === "PUT" && c.path.endsWith("/metadata/"))?.body as {
      metadata: { apps: { recruit: Record<string, unknown> } };
    }
  )?.metadata.apps.recruit;

afterEach(() => vi.unstubAllGlobals());

describe("setupRecruit — the agent the public talks to", () => {
  const recruit = (over: Partial<Parameters<typeof setupRecruit>[0]> = {}) =>
    setupRecruit({
      org: "northfield",
      username: "admin",
      appUrl: "https://recruit.example.edu",
      authorization: "Token session",
      ...over,
    });
  const order = (calls: Call[], ...ends: string[]) =>
    ends.map((end) =>
      calls.findIndex((c) => c.method !== "GET" && c.path.split("?")[0].endsWith(end)),
    );

  it("mints its role-limited key before the agent exists, then opens the agent to visitors", async () => {
    const calls = fakePlatform();
    const result = await recruit({ voice: "Warm and plain." });

    expect(result).toMatchObject({ agentId: "agent-1", toolsWired: true, toolsAccess: "crm-user" });
    const [key, agent] = order(calls, "/api-tokens/", "/mentor-with-settings/");
    expect(key).toBeGreaterThan(-1);
    expect(key).toBeLessThan(agent);
    const mints = calls.filter((c) => c.method === "POST" && c.path.endsWith("/api-tokens/"));
    expect(mints.map((c) => c.body)).toEqual([
      {
        name: "recruit-student-tools",
        platform_key: "northfield",
        mode: "token_policies",
        policies_to_add: [42],
      },
    ]);
    const settings = calls
      .filter((c) => c.method === "PUT" && c.path.endsWith("/mentors/agent-1/settings/"))
      .map((c) => c.body as Record<string, unknown>);
    expect(settings.find((b) => "allow_anonymous" in b)).toMatchObject({
      allow_anonymous: true,
      mentor_visibility: "viewable_by_anyone",
      enable_safety_system: true,
      // What the platform's template switches on, and a visitor must not have.
      enable_virtual_machine: false,
      enable_memory_component: false,
      capability_subagents: false,
      safety_system_prompt: expect.stringMatching(/promises, guarantees or predicts admission/),
      // Fixed questions, so a page view costs no model call; a greeting that says what it is.
      starter_prompts: "suggested_prompt",
      proactive_response: expect.stringMatching(/an AI agent for the university/),
    });
    // The tool list is emptied before anything else is written to the new agent.
    expect(settings[0]).toEqual({ tool_slugs: [], mcp_servers: [] });
    expect(settings.find((b) => "system_prompt" in b)?.system_prompt).toMatch(
      /## Voice\nWarm and plain\.$/,
    );
    const server = calls.find((c) => c.method === "POST" && c.path.endsWith("/mcp-servers/"));
    expect(server?.body).toMatchObject({
      name: "ibl.ai/recruit public tools",
      url: "https://recruit.example.edu/api/mcp/northfield/recruit",
      auth_scope: "platform",
    });
    expect(saved(calls)).toMatchObject({
      studentAgentId: "agent-1",
      studentMcpServerId: 7,
      studentVoice: "Warm and plain.",
    });
    // The Chief of Staff's own record is not this setup's to write.
    expect(saved(calls)).not.toHaveProperty("agentId");
    expect(saved(calls)).not.toHaveProperty("toolsAccess");
  });

  it("leaves the Chief of Staff's record as it found it", async () => {
    const staff = { agentId: "staff-1", mcpServerId: 3, toolsAccess: "owner" };
    const calls = fakePlatform({ metadata: { apps: { recruit: staff } } });
    await recruit();

    expect(saved(calls)).toMatchObject({ ...staff, studentAgentId: "agent-1" });
    // Its key is its own: the Chief of Staff's is never dropped or re-minted.
    const keys = calls.filter((c) => c.path.includes("/api-tokens/"));
    expect(keys.some((c) => /recruit-tools\b/.test(c.path + JSON.stringify(c.body ?? "")))).toBe(
      false,
    );
  });

  it("refuses a platform that does not limit keys by role, and leaves nothing behind", async () => {
    for (const platform of [{ scopedKeyWorks: false }, { policies: [] }]) {
      const calls = fakePlatform(platform);
      await expect(recruit()).rejects.toThrow(/does not limit API keys by role/);

      expect(calls.some((c) => c.path.endsWith("/mentor-with-settings/"))).toBe(false);
      expect(calls.some((c) => c.method === "PUT")).toBe(false);
      // No owner key is ever minted, and a scoped one the CRM refused is deleted.
      const keys = calls.filter((c) => c.path.includes("/api-tokens/"));
      expect(
        keys.every(
          (c) =>
            (c.body as { mode?: string } | undefined)?.mode !== undefined || c.method === "DELETE",
        ),
      ).toBe(true);
      expect(keys.at(-1)?.method).toBe("DELETE");
      vi.unstubAllGlobals();
    }
  });

  it("refuses the community platform before any request", async () => {
    const calls = fakePlatform();
    await expect(recruit({ org: "main" })).rejects.toThrow(/community platform/);
    expect(calls).toEqual([]);
  });

  const local = { appUrl: "http://localhost:3000" };
  const prompts = (calls: Call[]) =>
    calls
      .map((c) => (c.body as { system_prompt?: string } | undefined)?.system_prompt)
      .filter((p): p is string => typeof p === "string");
  const toolLists = (calls: Call[]) =>
    calls
      .filter((c) => c.method === "PUT" && "tool_slugs" in ((c.body as object | undefined) ?? {}))
      .map((c) => c.body);

  it("answers without an address the platform can call: no key, no tools, and a prompt that says so", async () => {
    // Something the template or an admin attached must not stay on a public agent.
    const calls = fakePlatform({
      agentSettings: { tool_slugs: ["web-search"], mcp_servers: [99] },
    });
    const result = await recruit(local);

    expect(result).toMatchObject({
      agentId: "agent-1",
      toolsWired: false,
      mcpServerId: null,
      toolsAccess: null,
    });
    expect(calls.some((c) => c.path.includes("/api-tokens/"))).toBe(false);
    expect(calls.some((c) => c.method !== "GET" && c.path.includes("/mcp-server"))).toBe(false);
    expect(toolLists(calls)).toEqual([{ tool_slugs: [], mcp_servers: [] }]);
    expect(prompts(calls).length).toBeGreaterThan(1);
    for (const prompt of prompts(calls)) {
      expect(prompt).not.toMatch(/book_visit|request_counselor|offer a counselor/);
      expect(prompt).toMatch(/cannot sign anyone up/);
      expect(prompt).toMatch(/form on the page they are on/);
    }
    // Still open to visitors, still guarded.
    expect(
      calls.find((c) => c.method === "PUT" && "allow_anonymous" in ((c.body as object) ?? {}))
        ?.body,
    ).toMatchObject({ allow_anonymous: true, enable_safety_system: true });
    expect(saved(calls)).toMatchObject({ studentAgentId: "agent-1" });
    expect(saved(calls).studentMcpServerId ?? null).toBeNull();
  });

  it("gives it its own tool server and nothing else, and tells it so only once they are connected", async () => {
    const calls = fakePlatform({
      agentSettings: { tool_slugs: ["web-search"], mcp_servers: [99] },
    });
    await recruit();

    expect(toolLists(calls)).toEqual([
      { tool_slugs: [], mcp_servers: [] },
      { tool_slugs: ["mcp"], mcp_servers: [7], can_use_tools: true },
    ]);
    // Emptied before it is opened to visitors: a failure in between leaves no tool of the template's reachable.
    const emptied = calls.findIndex(
      (c) => c.method === "PUT" && "tool_slugs" in (c.body as object),
    );
    const opened = calls.findIndex(
      (c) => c.method === "PUT" && "allow_anonymous" in (c.body as object),
    );
    expect(emptied).toBeGreaterThan(-1);
    expect(emptied).toBeLessThan(opened);
    const told = prompts(calls);
    expect(told[0]).not.toMatch(/book_visit/);
    expect(told.at(-1)).toMatch(/book_visit/);
    const wired = calls.findLastIndex(
      (c) => c.method === "PUT" && "tool_slugs" in (c.body as object),
    );
    const last = calls.findLastIndex(
      (c) => typeof (c.body as { system_prompt?: string } | undefined)?.system_prompt === "string",
    );
    expect(last).toBeGreaterThan(wired);
  });

  it("keeps its suggested prompts on a platform that has no such prompt category", async () => {
    const calls = fakePlatform({ knowsCategory: false });
    await recruit(local);

    const made = calls
      .filter((c) => c.method === "POST" && c.path.endsWith("/prompt/"))
      .map((c) => c.body as { prompt: string; category?: string });
    const kept = made.filter((b) => !b.category).map((b) => b.prompt);
    expect(kept).toEqual(STUDENT_PROMPTS);
    expect(made.filter((b) => b.category)).toHaveLength(STUDENT_PROMPTS.length);
  });

  it("leaves connected tools alone when it runs where the platform cannot call", async () => {
    const calls = fakePlatform({
      metadata: { apps: { recruit: { studentAgentId: "agent-1", studentMcpServerId: 7 } } },
    });
    await recruit(local);

    expect(toolLists(calls)).toEqual([]);
    expect(calls.some((c) => c.path.includes("/api-tokens/"))).toBe(false);
    for (const prompt of prompts(calls)) expect(prompt).toMatch(/book_visit/);
    expect(saved(calls)).toMatchObject({ studentAgentId: "agent-1", studentMcpServerId: 7 });
  });

  it("forgets a tool server left by an agent that is gone", async () => {
    const calls = fakePlatform({
      metadata: { apps: { recruit: { studentAgentId: "gone", studentMcpServerId: 7 } } },
    });
    const result = await recruit(local);

    expect(result.created.agent).toBe(true);
    expect(toolLists(calls)).toEqual([{ tool_slugs: [], mcp_servers: [] }]);
    // Null is how a key is unset: the platform keeps one the body leaves out.
    expect(saved(calls)).toMatchObject({ studentAgentId: "agent-1", studentMcpServerId: null });
  });

  it("remembers a new agent at once, so a later failure cannot orphan it", async () => {
    const calls = fakePlatform({ serverFails: true });
    await expect(recruit()).rejects.toThrow(/Platform request failed \(500\)/);
    expect(saved(calls)).toEqual({ studentAgentId: "agent-1" });
  });

  it("reuses the agent it finds and creates nothing twice", async () => {
    const calls = fakePlatform({
      metadata: { apps: { recruit: { studentAgentId: "agent-1", studentMcpServerId: 7 } } },
    });
    const result = await recruit();

    expect(result.created.agent).toBe(false);
    expect(calls.some((c) => c.path.endsWith("/mentor-with-settings/"))).toBe(false);
    // The guardrail's wording is the admin's to edit once the agent exists; the switches are not.
    const kept = calls.find((c) => c.method === "PUT" && "allow_anonymous" in (c.body as object));
    expect(kept?.body).toMatchObject({ enable_safety_system: true, enable_virtual_machine: false });
    expect(kept?.body).not.toHaveProperty("safety_system_prompt");
    expect(kept?.body).not.toHaveProperty("safety_response");
    expect(kept?.body).not.toHaveProperty("starter_prompts");
    expect(kept?.body).not.toHaveProperty("proactive_response");
    // An existing agent keeps its tools working until the new key is written.
    const [key, connection] = order(calls, "/api-tokens/", "/mcp-server-connections/");
    expect(connection - key).toBeLessThanOrEqual(3);
  });
});

describe("unsetting a setting", () => {
  it("writes null, which the platform's merge keeps, and reads it back as absent", () => {
    const stored = { apps: { recruit: { agentId: "a", metaPixelId: "12345" } } };
    const sent = mergeRecruitSettings(stored, { googleTagId: "G-ABC123" }, ["metaPixelId"]);
    expect((sent.apps as { recruit: object }).recruit).toEqual({
      agentId: "a",
      googleTagId: "G-ABC123",
      metaPixelId: null,
    });
    expect(readRecruitSettings(sent)).toEqual({ agentId: "a", googleTagId: "G-ABC123" });
  });
});

describe("who may frame the chat", () => {
  it("keeps real origins and nothing that could ride into a header", () => {
    expect(
      cleanOrigins([
        "https://www.northfield.edu",
        "https://www.northfield.edu",
        "http://localhost:4000",
        "http://insecure.example",
        "https://a.example/path",
        "https://a.example; script-src *",
        "*",
        7,
      ]),
    ).toEqual(["https://www.northfield.edu", "http://localhost:4000"]);
    expect(cleanOrigins("https://www.northfield.edu")).toEqual([]);
  });
});

describe("who gets a handoff", () => {
  it("is the program's counselor, then the record's, then the default", () => {
    const settings = { counselors: { nursing: 44 }, handoffCounselorId: 2 };
    expect(counselorFor(settings, " Nursing ", 8)).toBe(44);
    expect(counselorFor(settings, "History", 8)).toBe(8);
    expect(counselorFor(settings, "History")).toBe(2);
    expect(counselorFor({}, "History")).toBeNull();
  });
});
